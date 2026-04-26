import type { CellCoord, Col, Row, UnitShape } from './types';
import { cellExists } from './field';
import { SHAPES } from '../data/shapeDefinitions';

export { SHAPES }; // Step 3: migrate direct import to data/shapeDefinitions

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
