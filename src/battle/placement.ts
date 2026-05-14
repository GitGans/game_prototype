import type { BattleState, Unit } from './types';
import type { CellCoord, Side, UnitShape } from '../shared/gridTypes';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';
import { cellExists, cellKey } from './field';
import { getOccupiedCells } from './shapes';
import { buildOccupancy } from './occupancy';

export function canPlace(
  anchor: CellCoord,
  shape: UnitShape,
  state: BattleState,
  side: Side,
): boolean {
  if (anchor.side !== side) return false;
  const cells = getOccupiedCells(anchor, shape);
  if (cells.length !== shape.offsets.length) return false;
  for (const coord of cells) {
    if (coord.side !== side) return false;
    if (!cellExists(coord)) return false;
    if (state.occupancy.cellToUnitId.has(cellKey(coord))) return false;
  }
  return true;
}

// Enforces bench slot range and uniqueness before mutating state.
// excludeUnitId: skip this unit's existing deployment in the uniqueness check
// (used when re-deploying a unit that is already on bench to a different slot).
function validateBenchSlot(
  state: BattleState,
  slot: number,
  excludeUnitId?: string,
): void {
  if (slot < 0 || slot >= state.benchSlotCount) {
    throw new Error(`Bench slot ${slot} is out of range [0, ${state.benchSlotCount})`);
  }
  for (const [unitId, deployment] of state.deployments) {
    if (unitId === excludeUnitId) continue;
    if (deployment.kind === 'bench' && deployment.slot === slot) {
      throw new Error(`Bench slot ${slot} is already occupied by unit "${unitId}"`);
    }
  }
}

// Adds a unit and its field deployment atomically. Rebuilds occupancy.
// Throws if the unit id or its deployment already exist.
export function addFieldUnit(state: BattleState, unit: Unit, anchor: CellCoord): BattleState {
  if (state.units.has(unit.id)) {
    throw new Error(`addFieldUnit: unit "${unit.id}" already exists in state.units`);
  }
  if (state.deployments.has(unit.id)) {
    throw new Error(`addFieldUnit: deployment already exists for unit "${unit.id}"`);
  }
  const newUnits = new Map(state.units);
  newUnits.set(unit.id, unit);
  const newDeployments = new Map(state.deployments);
  newDeployments.set(unit.id, { kind: 'field', anchor } satisfies UnitDeployment);
  return {
    ...state,
    units:       newUnits,
    deployments: newDeployments,
    occupancy:   buildOccupancy(newUnits, newDeployments),
  };
}

// Adds a unit and its bench deployment atomically. Validates slot range and uniqueness.
// Does NOT occupy any field cells.
// Throws if the unit id or deployment already exist, or if the bench slot is invalid.
export function addBenchUnit(state: BattleState, unit: Unit, slot: number): BattleState {
  if (state.units.has(unit.id)) {
    throw new Error(`addBenchUnit: unit "${unit.id}" already exists in state.units`);
  }
  if (state.deployments.has(unit.id)) {
    throw new Error(`addBenchUnit: deployment already exists for unit "${unit.id}"`);
  }
  validateBenchSlot(state, slot);
  const newUnits = new Map(state.units);
  newUnits.set(unit.id, unit);
  const newDeployments = new Map(state.deployments);
  newDeployments.set(unit.id, { kind: 'bench', slot } satisfies UnitDeployment);
  return {
    ...state,
    units:       newUnits,
    deployments: newDeployments,
    occupancy:   buildOccupancy(newUnits, newDeployments),
  };
}

// Changes an existing unit's deployment to field. Unit must already be in state.units.
// Overwrites any existing deployment (intended for re-deployment).
export function deployExistingUnitToField(
  state: BattleState,
  unitId: string,
  anchor: CellCoord,
): BattleState {
  if (!state.units.has(unitId)) {
    throw new Error(`deployExistingUnitToField: unit "${unitId}" not found in state.units`);
  }
  const newDeployments = new Map(state.deployments);
  newDeployments.set(unitId, { kind: 'field', anchor } satisfies UnitDeployment);
  return {
    ...state,
    deployments: newDeployments,
    occupancy:   buildOccupancy(state.units, newDeployments),
  };
}

// Changes an existing unit's deployment to bench. Unit must already be in state.units.
// Validates slot range and uniqueness; excludes the unit itself in the uniqueness check
// so a unit already on bench can be moved to a different slot.
export function deployExistingUnitToBench(
  state: BattleState,
  unitId: string,
  slot: number,
): BattleState {
  if (!state.units.has(unitId)) {
    throw new Error(`deployExistingUnitToBench: unit "${unitId}" not found in state.units`);
  }
  validateBenchSlot(state, slot, unitId);
  const newDeployments = new Map(state.deployments);
  newDeployments.set(unitId, { kind: 'bench', slot } satisfies UnitDeployment);
  return {
    ...state,
    deployments: newDeployments,
    occupancy:   buildOccupancy(state.units, newDeployments),
  };
}

// Temporary Stage 1 compatibility wrapper.
// Removed after Unit.anchor is removed and call sites use addFieldUnit() directly.
export function placeUnit(unit: Unit, state: BattleState): BattleState {
  return addFieldUnit(state, unit, unit.anchor);
}
