import { CellCoord, Col, Row, Side } from './types';

export function cellKey(coord: CellCoord): string {
  return `${coord.side}:${coord.row}:${coord.col}`;
}

export function cellExists(coord: CellCoord): boolean {
  return (
    (coord.side === 'player' || coord.side === 'enemy') &&
    (coord.row === 0 || coord.row === 1) &&
    coord.col >= 0 &&
    coord.col <= 2
  );
}

export function isFirstRow(coord: CellCoord): boolean {
  return coord.row === 0;
}

/** Returns all 12 cell coords for the entire field. */
export function getAllCells(): CellCoord[] {
  const cells: CellCoord[] = [];
  for (const side of ['player', 'enemy'] as Side[]) {
    for (const row of [0, 1] as Row[]) {
      for (const col of [0, 1, 2] as Col[]) {
        cells.push({ side, row, col });
      }
    }
  }
  return cells;
}

/** Returns all cells for a specific side. */
export function getSideCells(side: Side): CellCoord[] {
  const cells: CellCoord[] = [];
  for (const row of [0, 1] as Row[]) {
    for (const col of [0, 1, 2] as Col[]) {
      cells.push({ side, row, col });
    }
  }
  return cells;
}

export function parseCellKey(key: string): CellCoord | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  const [side, rowStr, colStr] = parts;
  const row = parseInt(rowStr, 10) as Row;
  const col = parseInt(colStr, 10) as Col;
  const coord: CellCoord = { side: side as Side, row, col };
  if (!cellExists(coord)) return null;
  return coord;
}
