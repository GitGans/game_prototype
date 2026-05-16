import type { BattleState, PlacementSelection, Unit } from './types';
import type { CellCoord }                             from '../shared/gridTypes';
import type { UnitDeployment }                        from '../shared/unitDeploymentTypes';
import { canPlace, deployExistingUnitToField, deployExistingUnitToBench } from './placement';
import {
  requireFieldDeployment,
  getFreeBenchSlot,
  getBenchSlotOccupant,
  isFieldUnit,
}                                                     from './deployment';
import { buildOccupancy }                             from './occupancy';

const CLEAR: PlacementSelection = {
  selectedBenchUnitId: null,
  selectedFieldUnitId: null,
};

// Creates a temporary BattleState with the given units removed from both
// state.units AND state.deployments, so that buildOccupancy does not throw.
// Use only for canPlace collision checks; never mutate state from this result.
function withoutUnits(state: BattleState, unitIds: string[]): BattleState {
  const units       = new Map(state.units);
  const deployments = new Map(state.deployments);
  for (const id of unitIds) {
    units.delete(id);
    deployments.delete(id);
  }
  return { ...state, units, deployments, occupancy: buildOccupancy(units, deployments) };
}

export function selectBenchSlot(state: BattleState, benchIdx: number): BattleState {
  if (benchIdx < 0 || benchIdx >= state.benchSlotCount) return state;

  const unit = getBenchSlotOccupant(state, benchIdx);
  if (!unit) return state; // empty slot per deployments → no-op

  return {
    ...state,
    placementSelection: {
      selectedBenchUnitId: unit.id,
      selectedFieldUnitId: null,
    },
  };
}

export function selectFieldUnit(state: BattleState, unitId: string): BattleState {
  const unit = state.units.get(unitId);
  if (!unit || unit.side !== 'player') return state;
  if (!isFieldUnit(state, unitId)) return state; // bench units cannot be selected as field units

  return {
    ...state,
    placementSelection: {
      selectedBenchUnitId: null,
      selectedFieldUnitId: unitId,
    },
  };
}

export function clearPlacementSelection(state: BattleState): BattleState {
  return { ...state, placementSelection: CLEAR };
}

// Places an existing bench unit onto the field.
// `unit` must already be in state.units with a bench deployment at benchIdx.
// `anchor` is the target field position.
export function placeBenchUnitOnField(
  state:    BattleState,
  unit:     Unit,
  anchor:   CellCoord,
  benchIdx: number,
): BattleState {
  if (benchIdx < 0 || benchIdx >= state.benchSlotCount) return state;
  if (unit.side !== 'player') return state;

  // Verify unit is actually bench-deployed at the declared slot.
  const deployment = state.deployments.get(unit.id);
  if (deployment?.kind !== 'bench') return state;
  if (deployment.slot !== benchIdx) return state;

  if (!canPlace(anchor, unit.shape, state, 'player')) return state;

  // deployExistingUnitToField overwrites bench deployment with field deployment
  // and rebuilds occupancy from scratch.
  const next = deployExistingUnitToField(state, unit.id, anchor);
  return { ...next, placementSelection: CLEAR };
}

// Swaps an existing bench unit with an existing field unit.
// Both units stay in state.units; only their deployments change.
// fieldAnchor is derived from fieldUnit's deployment, not trusted from caller.
export function swapBenchWithField(
  state:     BattleState,
  benchUnit: Unit,
  benchIdx:  number,
  fieldUnit: Unit,
): BattleState {
  if (benchIdx < 0 || benchIdx >= state.benchSlotCount) return state;
  if (benchUnit.side !== 'player') return state;
  if (fieldUnit.side !== 'player') return state;

  // Verify bench unit is bench-deployed at the declared slot.
  const benchDeployment = state.deployments.get(benchUnit.id);
  if (benchDeployment?.kind !== 'bench') return state;
  if (benchDeployment.slot !== benchIdx) return state;

  // Verify field unit is field-deployed; derive anchor authoritatively from deployment.
  const fieldDeployment = state.deployments.get(fieldUnit.id);
  if (fieldDeployment?.kind !== 'field') return state;
  const fieldAnchor = fieldDeployment.anchor;

  // Free fieldAnchor for the canPlace check (bench unit has no field cells).
  const tmp = withoutUnits(state, [fieldUnit.id]);
  if (!canPlace(fieldAnchor, benchUnit.shape, tmp, 'player')) return state;

  // Atomic swap: update both deployments in one step to avoid intermediate conflicts.
  // Sequential helpers would fail: bench→field first puts two units at the same anchor;
  // field→bench first hits a validateBenchSlot conflict on the occupied slot.
  const newDeployments = new Map(state.deployments);
  newDeployments.set(benchUnit.id, { kind: 'field', anchor: fieldAnchor } satisfies UnitDeployment);
  newDeployments.set(fieldUnit.id, { kind: 'bench', slot: benchDeployment.slot } satisfies UnitDeployment);
  const next: BattleState = {
    ...state,
    deployments: newDeployments,
    occupancy:   buildOccupancy(state.units, newDeployments),
  };

  return { ...next, placementSelection: CLEAR };
}

// Swaps two field units' positions.
export function swapFieldUnits(state: BattleState, idA: string, idB: string): BattleState {
  const unitA = state.units.get(idA);
  const unitB = state.units.get(idB);
  if (!unitA || !unitB) return state;
  if (unitA.side !== 'player' || unitB.side !== 'player') return state;

  // requireFieldDeployment throws if either unit is not field-deployed — acts as guard.
  const anchorA = requireFieldDeployment(state, idA).anchor;
  const anchorB = requireFieldDeployment(state, idB).anchor;

  // Remove both for canPlace checks — each destination is occupied by the other.
  const tmp = withoutUnits(state, [idA, idB]);
  if (!canPlace(anchorB, unitA.shape, tmp, 'player')) return state;
  if (!canPlace(anchorA, unitB.shape, tmp, 'player')) return state;

  // Atomic swap.
  const newDeployments = new Map(state.deployments);
  newDeployments.set(idA, { kind: 'field', anchor: anchorB } satisfies UnitDeployment);
  newDeployments.set(idB, { kind: 'field', anchor: anchorA } satisfies UnitDeployment);
  const next: BattleState = {
    ...state,
    deployments: newDeployments,
    occupancy:   buildOccupancy(state.units, newDeployments),
  };
  return { ...next, placementSelection: CLEAR };
}

// Moves a field unit to a new anchor on the field.
export function moveFieldUnit(state: BattleState, unitId: string, newAnchor: CellCoord): BattleState {
  const unit = state.units.get(unitId);
  if (!unit || unit.side !== 'player') return state;

  // Verify unit is field-deployed before attempting a move.
  const deployment = state.deployments.get(unitId);
  if (deployment?.kind !== 'field') return state;

  // Free unit's current cells for the check.
  const tmp = withoutUnits(state, [unitId]);
  if (!canPlace(newAnchor, unit.shape, tmp, 'player')) return state;

  // Apply to original state (not tmp) — deployExistingUnitToField requires unit in state.units.
  // Old cells are freed when occupancy is rebuilt from scratch.
  return { ...deployExistingUnitToField(state, unitId, newAnchor), placementSelection: CLEAR };
}

// Moves a field unit to a specific bench slot.
// Unit stays in state.units; only its deployment changes.
export function moveFieldUnitToBench(state: BattleState, unitId: string, benchIdx: number): BattleState {
  if (benchIdx < 0 || benchIdx >= state.benchSlotCount) return state;
  const unit = state.units.get(unitId);
  if (!unit || unit.side !== 'player') return state;
  const deployment = state.deployments.get(unitId);
  if (deployment?.kind !== 'field') return state;

  // Check target slot is free using deployments as truth (not the mirror).
  for (const d of state.deployments.values()) {
    if (d.kind === 'bench' && d.slot === benchIdx) return state;
  }

  const next = deployExistingUnitToBench(state, unitId, benchIdx);
  return { ...next, placementSelection: CLEAR };
}

// Returns a field unit to the first free bench slot.
// Unit stays in state.units; only its deployment changes.
export function returnFieldUnitToBench(state: BattleState, unitId: string): BattleState {
  const unit = state.units.get(unitId);
  if (!unit || unit.side !== 'player') return state;
  const deployment = state.deployments.get(unitId);
  if (deployment?.kind !== 'field') return state;
  const slot = getFreeBenchSlot(state); // uses deployments as truth
  if (slot === null) return state;

  const next = deployExistingUnitToBench(state, unitId, slot);
  return { ...next, placementSelection: CLEAR };
}
