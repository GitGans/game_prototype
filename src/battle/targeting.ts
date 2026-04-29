import { CellCoord, Col, OccupancyMap, Row, Side, Skill, Unit } from './types';
import { cellKey } from './field';

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
    if (occupancy.cellToUnit.has(key)) return true;
  }
  return false;
}

/**
 * Returns valid melee target cells on the enemy side.
 * - If the attacker is in back row AND own front row is alive → blocked, returns []
 * - If enemy front row has any unit → only front-row occupied cells
 * - Otherwise → back-row occupied cells
 */
export function getMeleeTargets(attacker: Unit, occupancy: OccupancyMap): CellCoord[] {
  const attackerSide = attacker.anchor.side;

  // Back-row melee is blocked by own front row
  if (attacker.anchor.row === 1 && isFrontRowAlive(attackerSide, occupancy)) {
    return [];
  }

  const targetSide = ENEMY_SIDE[attackerSide];
  const frontAlive = isFrontRowAlive(targetSide, occupancy);
  const targetRow: Row = frontAlive ? 0 : 1;
  const cells: CellCoord[] = [];

  for (const col of [0, 1, 2] as Col[]) {
    const coord: CellCoord = { side: targetSide, row: targetRow, col };
    if (occupancy.cellToUnit.has(cellKey(coord))) {
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
      if (occupancy.cellToUnit.has(cellKey(coord))) {
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
 */
export function getSelfTarget(caster: Unit): CellCoord[] {
  return [{ side: caster.anchor.side, row: caster.anchor.row, col: caster.anchor.col }];
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
      if (occupancy.cellToUnit.has(cellKey(coord))) {
        cells.push(coord);
      }
    }
  }

  return cells;
}

/**
 * Returns valid target cells for a unit using the given skill.
 * Routes to the four low-level target helpers based on skill actionType.
 */
export function resolveSkillTargets(
  unit: Unit,
  skill: Skill,
  occupancy: OccupancyMap,
): CellCoord[] {
  if (skill.actionType === 'mass_enchantment') {
    return getFriendlyTargets(unit.anchor.side, occupancy);
  }
  if (skill.actionType === 'self_enchantment') {
    return getSelfTarget(unit);
  }
  if (skill.actionType === 'ranged') {
    return getRangedTargets(unit.anchor.side, occupancy);
  }
  return getMeleeTargets(unit, occupancy);
}
