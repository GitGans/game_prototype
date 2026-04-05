import { CellCoord, Col, OccupancyMap, Row, Side } from './types';
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
 * - If enemy front row has any unit → only front-row occupied cells
 * - Otherwise → back-row occupied cells
 */
export function getMeleeTargets(attackerSide: Side, occupancy: OccupancyMap): CellCoord[] {
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
