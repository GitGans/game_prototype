import { CellCoord, Col, Row, UnitShape } from './types';
import { cellExists } from './field';

export const SHAPES: Record<string, UnitShape> = {
  '1x1': { offsets: [{ dr: 0, dc: 0 }] },
  '1x2': { offsets: [{ dr: 0, dc: 0 }, { dr: 0, dc: 1 }] },       // 1 row, 2 cols wide
  '2x1': { offsets: [{ dr: 0, dc: 0 }, { dr: 1, dc: 0 }] },       // 2 rows tall, 1 col
  '2x2': { offsets: [{ dr: 0, dc: 0 }, { dr: 0, dc: 1 }, { dr: 1, dc: 0 }, { dr: 1, dc: 1 }] },
};

/**
 * Returns all cells occupied by a unit given its anchor and shape.
 * Filters out any coords that fall outside the field.
 */
export function getOccupiedCells(anchor: CellCoord, shape: UnitShape): CellCoord[] {
  const cells: CellCoord[] = [];
  for (const { dr, dc } of shape.offsets) {
    const row = (anchor.row + dr) as Row;
    const col = (anchor.col + dc) as Col;
    const coord: CellCoord = { side: anchor.side, row, col };
    if (cellExists(coord)) {
      cells.push(coord);
    }
  }
  return cells;
}
