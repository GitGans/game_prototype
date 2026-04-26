import type { BattleState }       from '../../battle/types';
import type { PhaseAction }       from '../phases';
import type { PlayerBattleSetup } from '../battleSetup';
import { buildPlayerUnitInput }   from '../battleSetupProjection';
import { createUnitInstance }     from '../../battle/unitFactory';
import {
  selectBenchSlot,
  selectFieldUnit,
  clearPlacementSelection,
  placeBenchUnitOnField,
  swapBenchWithField,
  swapFieldUnits,
  moveFieldUnit,
  moveFieldUnitToBench,
  returnFieldUnitToBench,
} from '../../battle/placementState';

export type BattlePlacementAction = Extract<PhaseAction, {
  type:
    | 'select_bench_slot'
    | 'select_field_unit'
    | 'clear_placement_selection'
    | 'place_bench_unit'
    | 'swap_bench_with_field'
    | 'move_field_unit'
    | 'move_field_unit_to_bench'
    | 'return_field_unit_to_bench'
    | 'swap_field_units'
}>;

const PLACEMENT_ACTION_TYPES = new Set<string>([
  'select_bench_slot', 'select_field_unit', 'clear_placement_selection',
  'place_bench_unit', 'swap_bench_with_field', 'move_field_unit',
  'move_field_unit_to_bench', 'return_field_unit_to_bench', 'swap_field_units',
]);

export function isBattlePlacementAction(action: PhaseAction): action is BattlePlacementAction {
  return PLACEMENT_ACTION_TYPES.has(action.type);
}

export function applyBattlePlacementAction(
  state:  BattleState,
  setup:  PlayerBattleSetup,
  action: BattlePlacementAction,
): BattleState {
  if (state.phase !== 'placement') return state;

  switch (action.type) {
    case 'select_bench_slot':
      return selectBenchSlot(state, action.benchIdx);

    case 'select_field_unit':
      return selectFieldUnit(state, action.unitId);

    case 'clear_placement_selection':
      return clearPlacementSelection(state);

    case 'place_bench_unit': {
      const ref = state.benchUnits[action.benchIdx];
      if (!ref) return state;
      const id    = `p${state.nextPlayerId}`;
      const input = buildPlayerUnitInput(ref.templateId, action.anchor, id, setup);
      if (!input) return state;
      const unit = createUnitInstance(input);
      const next = placeBenchUnitOnField(state, unit, action.benchIdx);
      return next === state ? state : { ...next, nextPlayerId: state.nextPlayerId + 1 };
    }

    case 'swap_bench_with_field': {
      const ref       = state.benchUnits[action.benchIdx];
      const fieldUnit = state.units.get(action.fieldUnitId);
      if (!ref || !fieldUnit) return state;
      const id    = `p${state.nextPlayerId}`;
      const input = buildPlayerUnitInput(ref.templateId, fieldUnit.anchor, id, setup);
      if (!input) return state;
      const newUnit = createUnitInstance(input);
      const next    = swapBenchWithField(state, newUnit, action.benchIdx, fieldUnit);
      return next === state ? state : { ...next, nextPlayerId: state.nextPlayerId + 1 };
    }

    case 'move_field_unit':
      return moveFieldUnit(state, action.unitId, action.anchor);

    case 'move_field_unit_to_bench':
      return moveFieldUnitToBench(state, action.unitId, action.benchIdx);

    case 'return_field_unit_to_bench':
      return returnFieldUnitToBench(state, action.unitId);

    case 'swap_field_units':
      return swapFieldUnits(state, action.unitAId, action.unitBId);
  }
}
