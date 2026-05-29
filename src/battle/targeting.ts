import { BattleState, CellCoord, Col, OccupancyMap, Row, Side } from './types';
import { cellKey } from './field';
import { getOccupiedCells } from './shapes';
import { getDeadFieldUnitEntries, requireFieldDeployment } from './deployment';
import type { SkillTargetPolicy } from './skillUsePlan';

const ENEMY_SIDE: Record<Side, Side> = {
  player: 'enemy',
  enemy: 'player',
};

/**
 * Returns true if any front-row cell (row 0) on the given side
 * is occupied by a living unit.
 */
export function isFrontRowAlive(side: Side, occupancy: OccupancyMap): boolean {
  for (const col of [0, 1, 2] as Col[]) {
    const key = cellKey({ side, row: 0 as Row, col });
    if (occupancy.cellToUnitId.has(key)) return true;
  }
  return false;
}

/**
 * Returns valid melee target cells on the enemy side.
 * - If the attacker is in back row AND own front row is alive → blocked, returns []
 * - If enemy front row has any unit → only front-row occupied cells
 * - Otherwise → back-row occupied cells
 *
 * `attackerAnchor` is the attacker's current field anchor, obtained from deployment.
 */
export function getMeleeTargets(
  attackerAnchor: CellCoord,
  occupancy:      OccupancyMap,
): CellCoord[] {
  const attackerSide = attackerAnchor.side;

  // Back-row melee is blocked by own front row
  if (attackerAnchor.row === 1 && isFrontRowAlive(attackerSide, occupancy)) {
    return [];
  }

  const targetSide = ENEMY_SIDE[attackerSide];
  const frontAlive = isFrontRowAlive(targetSide, occupancy);
  const targetRow: Row = frontAlive ? 0 : 1;
  const cells: CellCoord[] = [];

  for (const col of [0, 1, 2] as Col[]) {
    const coord: CellCoord = { side: targetSide, row: targetRow, col };
    if (occupancy.cellToUnitId.has(cellKey(coord))) {
      cells.push(coord);
    }
  }

  return cells;
}

/**
 * Returns all occupied friendly cells (same side as the healer).
 */
export function getFriendlyTargets(side: Side, occupancy: OccupancyMap): CellCoord[] {
  const cells: CellCoord[] = [];

  for (const row of [0, 1] as Row[]) {
    for (const col of [0, 1, 2] as Col[]) {
      const coord: CellCoord = { side, row, col };
      if (occupancy.cellToUnitId.has(cellKey(coord))) {
        cells.push(coord);
      }
    }
  }

  return cells;
}

/**
 * Returns a single-element array containing only the caster's own cell.
 * Used for self_enchantment skills — the caster is always the origin,
 * but the skill pattern may spread to surrounding allies from there.
 *
 * `casterAnchor` is the caster's current field anchor, obtained from deployment.
 */
export function getSelfTarget(casterAnchor: CellCoord): CellCoord[] {
  return [{ ...casterAnchor }];
}

/**
 * Returns all occupied enemy cells regardless of row.
 */
export function getRangedTargets(attackerSide: Side, occupancy: OccupancyMap): CellCoord[] {
  const targetSide = ENEMY_SIDE[attackerSide];
  const cells: CellCoord[] = [];

  for (const row of [0, 1] as Row[]) {
    for (const col of [0, 1, 2] as Col[]) {
      const coord: CellCoord = { side: targetSide, row, col };
      if (occupancy.cellToUnitId.has(cellKey(coord))) {
        cells.push(coord);
      }
    }
  }

  return cells;
}

/**
 * Returns body cells of all dead field-deployed allies on `casterSide`.
 * Uses deployment + shape — does NOT consult occupancy (dead units do not
 * occupy cells per Stage 2). Side-relative: works for both player and
 * enemy casters targeting their own dead allies.
 */
export function getDeadAllyFieldUnitTargets(
  state:      BattleState,
  casterSide: Side,
): CellCoord[] {
  const cells: CellCoord[] = [];
  for (const [unitId, unit] of getDeadFieldUnitEntries(state)) {
    if (unit.side !== casterSide) continue;
    const deployment = requireFieldDeployment(state, unitId);
    for (const cell of getOccupiedCells(deployment.anchor, unit.shape)) {
      cells.push(cell);
    }
  }
  return cells;
}

/**
 * `unitAnchor` is the acting unit's current field anchor, obtained from deployment.
 * Callers: `const unitAnchor = requireFieldDeployment(state, unit.id).anchor;`
 *
 * Dead-caster safety is enforced upstream by `isAlive(caster)` guards in the
 * executor and turn-flow entry points — not inside this resolver.
 */
export function resolveSkillTargetsForPolicy(
  targetPolicy: SkillTargetPolicy,
  state:        BattleState,
  unitAnchor:   CellCoord,
): CellCoord[] {
  switch (targetPolicy.type) {
    case 'friendly':
      return getFriendlyTargets(unitAnchor.side, state.occupancy);

    case 'self':
      return getSelfTarget(unitAnchor);

    case 'enemy_ranged':
      return getRangedTargets(unitAnchor.side, state.occupancy);

    case 'enemy_melee':
      return getMeleeTargets(unitAnchor, state.occupancy);

    case 'dead_ally_field_unit':
      return getDeadAllyFieldUnitTargets(state, unitAnchor.side);

    default: {
      const _exhaustive: never = targetPolicy;
      return _exhaustive;
    }
  }
}
