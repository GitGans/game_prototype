import { CellCoord } from './types';

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
