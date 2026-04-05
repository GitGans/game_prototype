import { BattleState, CellCoord, Side, Unit, UnitShape } from './types';
import { cellExists, cellKey } from './field';
import { getOccupiedCells } from './shapes';
import { buildOccupancy } from './occupancy';

export function canPlace(
  anchor: CellCoord,
  shape: UnitShape,
  state: BattleState,
  side: Side
): boolean {
  // Anchor must be on the correct side
  if (anchor.side !== side) return false;

  const cells = getOccupiedCells(anchor, shape);

  // All offsets must land on existing cells
  if (cells.length !== shape.offsets.length) return false;

  // All cells must be on the correct side and free
  for (const coord of cells) {
    if (coord.side !== side) return false;
    if (!cellExists(coord)) return false;
    if (state.occupancy.cellToUnit.has(cellKey(coord))) return false;
  }

  return true;
}

export function placeUnit(unit: Unit, state: BattleState): BattleState {
  const newUnits = new Map(state.units);
  newUnits.set(unit.id, unit);
  return {
    ...state,
    units: newUnits,
    occupancy: buildOccupancy(newUnits),
  };
}
