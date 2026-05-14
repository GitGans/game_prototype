import type { BattleState, PlacementSelection, Unit } from './types';
import type { CellCoord }                             from '../shared/gridTypes';
import { canPlace, placeUnit }                        from './placement';
import { buildOccupancy }                             from './occupancy';

const CLEAR: PlacementSelection = {
  selectedBenchIdx:    null,
  selectedFieldUnitId: null,
};

export function selectBenchSlot(state: BattleState, benchIdx: number): BattleState {
  if (benchIdx < 0 || benchIdx >= state.benchUnits.length) return state;
  if (!state.benchUnits[benchIdx]) return state; // empty slot has nothing to select
  return { ...state, placementSelection: { selectedBenchIdx: benchIdx, selectedFieldUnitId: null } };
}

export function selectFieldUnit(state: BattleState, unitId: string): BattleState {
  const unit = state.units.get(unitId);
  if (!unit || unit.anchor.side !== 'player') return state;
  return { ...state, placementSelection: { selectedBenchIdx: null, selectedFieldUnitId: unitId } };
}

export function clearPlacementSelection(state: BattleState): BattleState {
  return { ...state, placementSelection: CLEAR };
}

// unit is already constructed by the caller (handler passes it in)
export function placeBenchUnitOnField(
  state:    BattleState,
  unit:     Unit,
  benchIdx: number,
): BattleState {
  if (benchIdx < 0 || benchIdx >= state.benchUnits.length) return state;
  if (!canPlace(unit.anchor, unit.shape, state, 'player')) return state;
  let next = placeUnit(unit, state);
  const newBench = [...next.benchUnits];
  newBench[benchIdx] = undefined;
  return { ...next, benchUnits: newBench, placementSelection: CLEAR };
}

export function swapBenchWithField(
  state:     BattleState,
  newUnit:   Unit, // bench unit, already constructed
  benchIdx:  number,
  fieldUnit: Unit,
): BattleState {
  if (benchIdx < 0 || benchIdx >= state.benchUnits.length) return state;
  if (fieldUnit.anchor.side !== 'player') return state;

  const newUnits = new Map(state.units);
  newUnits.delete(fieldUnit.id);
  const newDeployments = new Map(state.deployments);
  newDeployments.delete(fieldUnit.id); // remove — fieldUnit is leaving state.units
  let next: BattleState = {
    ...state,
    units:       newUnits,
    deployments: newDeployments,
    occupancy:   buildOccupancy(newUnits, newDeployments),
  };

  if (!canPlace(newUnit.anchor, newUnit.shape, next, 'player')) return state;

  next = placeUnit(newUnit, next);
  const newBench = [...next.benchUnits];
  newBench[benchIdx] = { templateId: fieldUnit.templateId };
  return { ...next, benchUnits: newBench, placementSelection: CLEAR };
}

export function swapFieldUnits(state: BattleState, idA: string, idB: string): BattleState {
  const unitA = state.units.get(idA);
  const unitB = state.units.get(idB);
  if (!unitA || !unitB) return state;
  if (unitA.anchor.side !== 'player' || unitB.anchor.side !== 'player') return state;

  const tmpUnits = new Map(state.units);
  tmpUnits.delete(idA);
  tmpUnits.delete(idB);
  const tmpDeployments = new Map(state.deployments);
  tmpDeployments.delete(idA); // remove — addFieldUnit() would throw on re-add otherwise
  tmpDeployments.delete(idB);
  const tmp: BattleState = {
    ...state,
    units:       tmpUnits,
    deployments: tmpDeployments,
    occupancy:   buildOccupancy(tmpUnits, tmpDeployments),
  };

  if (!canPlace(unitB.anchor, unitA.shape, tmp, 'player')) return state;
  if (!canPlace(unitA.anchor, unitB.shape, tmp, 'player')) return state;

  let next = placeUnit({ ...unitA, anchor: unitB.anchor }, tmp);
  next = placeUnit({ ...unitB, anchor: unitA.anchor }, next);
  return { ...next, placementSelection: CLEAR };
}

export function moveFieldUnit(state: BattleState, unitId: string, newAnchor: CellCoord): BattleState {
  const unit = state.units.get(unitId);
  if (!unit) return state;
  if (unit.anchor.side !== 'player') return state;

  const tmpUnits = new Map(state.units);
  tmpUnits.delete(unitId);
  const tmpDeployments = new Map(state.deployments);
  tmpDeployments.delete(unitId); // remove — addFieldUnit() would throw on re-add otherwise
  const tmp: BattleState = {
    ...state,
    units:       tmpUnits,
    deployments: tmpDeployments,
    occupancy:   buildOccupancy(tmpUnits, tmpDeployments),
  };

  if (!canPlace(newAnchor, unit.shape, tmp, 'player')) return state;

  const next = placeUnit({ ...unit, anchor: newAnchor }, tmp);
  return { ...next, placementSelection: CLEAR };
}

export function moveFieldUnitToBench(state: BattleState, unitId: string, benchIdx: number): BattleState {
  if (benchIdx < 0 || benchIdx >= state.benchUnits.length) return state;
  const unit = state.units.get(unitId);
  if (!unit) return state;
  if (unit.anchor.side !== 'player') return state;
  if (state.benchUnits[benchIdx] !== undefined) return state; // slot occupied

  const newUnits = new Map(state.units);
  newUnits.delete(unit.id);
  const newDeployments = new Map(state.deployments);
  newDeployments.delete(unit.id); // remove — unit is leaving state.units
  const newBench = [...state.benchUnits];
  newBench[benchIdx] = { templateId: unit.templateId };
  return {
    ...state,
    units:              newUnits,
    deployments:        newDeployments,
    occupancy:          buildOccupancy(newUnits, newDeployments),
    benchUnits:         newBench,
    placementSelection: CLEAR,
  };
}

export function returnFieldUnitToBench(state: BattleState, unitId: string): BattleState {
  const unit = state.units.get(unitId);
  if (!unit) return state;
  if (unit.anchor.side !== 'player') return state;
  const emptyIdx = state.benchUnits.indexOf(undefined);
  if (emptyIdx === -1) return state; // bench full

  const newUnits = new Map(state.units);
  newUnits.delete(unit.id);
  const newDeployments = new Map(state.deployments);
  newDeployments.delete(unit.id); // remove — unit is leaving state.units
  const newBench = [...state.benchUnits];
  newBench[emptyIdx] = { templateId: unit.templateId };
  return {
    ...state,
    units:              newUnits,
    deployments:        newDeployments,
    occupancy:          buildOccupancy(newUnits, newDeployments),
    benchUnits:         newBench,
    placementSelection: CLEAR,
  };
}
