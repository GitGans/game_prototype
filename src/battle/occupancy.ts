import { CellCoord, OccupancyMap, Unit } from './types';
import { cellKey } from './field';
import { getOccupiedCells } from './shapes';

export function buildOccupancy(units: Map<string, Unit>): OccupancyMap {
  const cellToUnit = new Map<string, Unit>();
  const unitToCells = new Map<string, CellCoord[]>();

  for (const unit of units.values()) {
    const cells = getOccupiedCells(unit.anchor, unit.shape);
    unitToCells.set(unit.id, cells);
    for (const coord of cells) {
      cellToUnit.set(cellKey(coord), unit);
    }
  }

  return { cellToUnit, unitToCells };
}

export function getUnitAtCell(coord: CellCoord, occupancy: OccupancyMap): Unit | null {
  return occupancy.cellToUnit.get(cellKey(coord)) ?? null;
}

export function removeUnit(unitId: string, occupancy: OccupancyMap): OccupancyMap {
  const cells = occupancy.unitToCells.get(unitId) ?? [];
  const newCellToUnit = new Map(occupancy.cellToUnit);
  const newUnitToCells = new Map(occupancy.unitToCells);

  for (const coord of cells) {
    newCellToUnit.delete(cellKey(coord));
  }
  newUnitToCells.delete(unitId);

  return { cellToUnit: newCellToUnit, unitToCells: newUnitToCells };
}
