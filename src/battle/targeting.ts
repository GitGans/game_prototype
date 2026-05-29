import { CellCoord, Col, OccupancyMap, Row, Side } from './types';
import { cellKey } from './field';
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
 * `unitAnchor` is the acting unit's current field anchor, obtained from deployment.
 * Callers: `const unitAnchor = requireFieldDeployment(state, unit.id).anchor;`
 */
export function resolveSkillTargetsForPolicy(
  targetPolicy: SkillTargetPolicy,
  occupancy:    OccupancyMap,
  unitAnchor:   CellCoord,
): CellCoord[] {
  switch (targetPolicy.type) {
    case 'friendly':
      return getFriendlyTargets(unitAnchor.side, occupancy);

    case 'self':
      return getSelfTarget(unitAnchor);

    case 'enemy_ranged':
      return getRangedTargets(unitAnchor.side, occupancy);

    case 'enemy_melee':
      return getMeleeTargets(unitAnchor, occupancy);

    default: {
      const _exhaustive: never = targetPolicy;
      return _exhaustive;
    }
  }
}
