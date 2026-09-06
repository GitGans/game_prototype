import type { BattleState, OccupancyMap, Unit } from './types';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';
import type { CellCoord } from '../shared/gridTypes';
import { cellKey } from './field';
import { getOccupiedCells } from './shapes';
import { isAlive } from './lifeState';

export function buildOccupancy(
  units: ReadonlyMap<string, Unit>,
  deployments: ReadonlyMap<string, UnitDeployment>,
): OccupancyMap {
  const cellToUnitId = new Map<string, string>();
  const unitToCells = new Map<string, CellCoord[]>();

  for (const unit of units.values()) {
    const deployment = deployments.get(unit.id);
    if (!deployment) {
      throw new Error(
        `buildOccupancy: unit "${unit.id}" has no deployment. ` +
        `All units in the units map must have a corresponding deployment entry.`,
      );
    }
    if (deployment.kind !== 'field') continue;
    if (!isAlive(unit)) continue; // dead field units occupy no cells

    const cells = getOccupiedCells(deployment.anchor, unit.shape);
    unitToCells.set(unit.id, cells);
    for (const coord of cells) {
      cellToUnitId.set(cellKey(coord), unit.id);
    }
  }

  return { cellToUnitId, unitToCells };
}

export function removeUnit(unitId: string, occupancy: OccupancyMap): OccupancyMap {
  const cells = occupancy.unitToCells.get(unitId) ?? [];
  const newCellToUnitId = new Map(occupancy.cellToUnitId);
  const newUnitToCells = new Map(occupancy.unitToCells);

  for (const coord of cells) {
    newCellToUnitId.delete(cellKey(coord));
  }
  newUnitToCells.delete(unitId);

  return { cellToUnitId: newCellToUnitId, unitToCells: newUnitToCells };
}

// Resolves the unit at a given cell by id lookup.
// Returns only living blocking units — occupancy excludes dead field units.
// For dead-unit-at-cell lookup, walk state.deployments + getOccupiedCells instead.
export function getUnitAtCell(state: BattleState, coord: CellCoord): Unit | null {
  const unitId = state.occupancy.cellToUnitId.get(cellKey(coord));
  return unitId ? (state.units.get(unitId) ?? null) : null;
}
