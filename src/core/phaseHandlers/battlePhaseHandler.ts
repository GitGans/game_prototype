import type { BattleState, BattleMode } from '../../battle/types';
import type { PhaseAction }            from '../phases';
import type { Rng }                    from '../../shared/random';
import { buildRoundQueue }             from '../../battle/initiative';
import type { BattleEvent }            from '../../battle/battleEvents';
import type { Side, CellCoord }        from '../../shared/gridTypes';
import {
  type TurnContext,
  type TurnStartDirective,
} from '../../battle/turnResolver';
import { checkGameOver }               from '../../battle/combat';
import { resolveBattleTransition }     from '../../battle/battleTransition';
import { resolveSkillTurn }            from '../../battle/skillTurnResolver';
import { decideAutoTurn }             from '../../battle/autoTurn';
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
import { getBenchSlotOccupant, getLivingFieldUnitEntries } from '../../battle/deployment';
import { isAlive } from '../../battle/lifeState';
import { canBeginCombat } from '../../battle/combatStart';
import type { PlayerSessionSource }     from '../playerSessionState';
import { PlayerSessionStore }           from '../playerSessionStore';
import { applyFieldPlacementsToRoster } from '../playerUnitPersistence';
import type { AutoTurnIntention } from '../battleRuntimeContext';
export type { AutoTurnIntention };

// ─── Battle Lifecycle Actions ─────────────────────────────────────────────────

export type BattleLifecycleAction = Extract<PhaseAction, {
  type:
    | 'battle_begin_combat'
    | 'battle_mark_quick_battle_complete'
}>;

const BATTLE_LIFECYCLE_ACTION_TYPES = new Set<string>([
  'battle_begin_combat',
  'battle_mark_quick_battle_complete',
]);

export function isBattleLifecycleAction(action: PhaseAction): action is BattleLifecycleAction {
  return BATTLE_LIFECYCLE_ACTION_TYPES.has(action.type);
}

export type BattleLifecycleActionResult = {
  state: BattleState;
  resetTurnContext?: boolean;
  persistPlayerPlacements?: boolean;
};

export function applyBattleLifecycleAction(input: {
  state:  BattleState;
  action: BattleLifecycleAction;
}): BattleLifecycleActionResult {
  const { state, action } = input;

  switch (action.type) {
    case 'battle_begin_combat': {
      // Subsumes the previous `state.phase !== 'placement'` guard. UI state is
      // never trusted as validation.
      if (!canBeginCombat(state)) return { state };
      return {
        state: {
          ...state,
          roundQueue:         buildRoundQueue(new Map(getLivingFieldUnitEntries(state))),
          phase:              'select_target',
          placementSelection: { selectedBenchUnitId: null, selectedFieldUnitId: null },
        },
        resetTurnContext:        true,
        persistPlayerPlacements: true,
      };
    }

    case 'battle_mark_quick_battle_complete':
      return { state: { ...state, phase: 'end' } };
  }
}

// ─── Application-level lifecycle (pure rule + storage routing) ────────────────
// `applyBattleLifecycleAction` decides WHAT happens; this decides WHERE the
// confirmed placement is stored. Placement rules live in neither.

export function applyBattleLifecyclePhaseAction(input: {
  source: PlayerSessionSource;
  state:  BattleState;
  action: BattleLifecycleAction;
}): BattleLifecycleActionResult {
  const { source, state, action } = input;

  const result = applyBattleLifecycleAction({ state, action });

  if (result.persistPlayerPlacements) {
    // The pre-action state is the placement the player confirmed.
    const session = PlayerSessionStore.getSession(source);
    PlayerSessionStore.replaceRoster(source, applyFieldPlacementsToRoster(session.roster, state));
  }

  return result;
}

// ─── Battle Preview Target (transient manual-targeting UI state) ───────────────

// Returns a new BattleState (battle invariant: never mutate in place).
// A copied coord avoids aliasing the dispatched action.
export function setBattlePreviewTarget(
  state:  BattleState,
  target: CellCoord | null,
): BattleState {
  return { ...state, previewTargetCoord: target ? { ...target } : null };
}

// ─── Battle Placement Actions ─────────────────────────────────────────────────

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

// ─── Battle Turn Actions ──────────────────────────────────────────────────────

export type BattleTurnPhaseAction = Extract<PhaseAction, {
  type:
    | 'battle_start_turn'
    | 'battle_select_skill'
    | 'battle_use_skill'
    | 'battle_advance_turn'
    | 'battle_skip_turn'
    | 'battle_charge_turn'
    | 'battle_quick_turn'
    | 'battle_decide_auto_turn'
    | 'battle_apply_auto_turn'
}>;

const BATTLE_TURN_ACTION_TYPES = new Set<string>([
  'battle_start_turn', 'battle_select_skill', 'battle_use_skill',
  'battle_advance_turn', 'battle_skip_turn', 'battle_charge_turn',
  'battle_quick_turn',
  'battle_decide_auto_turn',
  'battle_apply_auto_turn',
]);

export function isBattleTurnAction(action: PhaseAction): action is BattleTurnPhaseAction {
  return BATTLE_TURN_ACTION_TYPES.has(action.type);
}

export type BattleAutoTurnDirective =
  | { type: 'none';          reason: 'battle_ended' | 'non_auto_mode' }
  | { type: 'handoff_manual' }
  | { type: 'restart_turn' }
  | { type: 'intention'; intention: AutoTurnIntention; animateAttack: boolean };

export type BattlePhaseActionResult = {
  state:               BattleState;
  context:             TurnContext;
  events:              BattleEvent[];
  directive?:          TurnStartDirective;
  winner?:             Side;
  autoTurnDirective?:  BattleAutoTurnDirective;
  autoTurnApplied?:    boolean;
};

function withWinner(
  result: Omit<BattlePhaseActionResult, 'winner'>,
): BattlePhaseActionResult {
  const winner = checkGameOver(result.state);
  if (!winner) return result;
  return { ...result, state: { ...result.state, phase: 'end' }, winner };
}

export function applyBattleTurnAction(input: {
  state:                     BattleState;
  context:                   TurnContext;
  action:                    BattleTurnPhaseAction;
  mode:                      BattleMode;
  rng:                       Rng;
  pendingAutoTurnIntention?: AutoTurnIntention | null;
}): BattlePhaseActionResult {
  const { state, context, action, mode, rng } = input;

  switch (action.type) {

    // resolveActiveTurnStart can call advanceTurn internally (missing active
    // unit, or manual melee blocked and auto-skipped). advanceTurn ticks
    // round effects which can kill units → check game-over.
    case 'battle_start_turn': {
      const result = resolveBattleTransition({ state, context, action: { type: 'start_turn', mode }, rng });
      return withWinner({ state: result.state, context: result.context, events: result.events, directive: result.directive });
    }

    // Pure UI state — no damage, no queue advancement.
    case 'battle_select_skill': {
      const result = resolveBattleTransition({ state, context, action: { type: 'select_skill', skillIndex: action.skillIndex }, rng });
      return { state: result.state, context: result.context, events: result.events };
    }

    // Compound: skill → game-over → advance turn → game-over.
    // Two explicit checks because the order is load-bearing (matches Game.ts).
    // Do NOT collapse into withWinner.
    case 'battle_use_skill': {
      const result = resolveSkillTurn({
        state,
        context,
        unitId:     action.unitId,
        target:     action.target,
        skillIndex: action.skillIndex,
        rng,
      });
      return {
        state:   result.state,
        context: result.context,
        events:  result.events,
        ...(result.winner ? { winner: result.winner } : {}),
      };
    }

    // Round-end effect ticks happen inside advanceTurn and can kill units.
    case 'battle_advance_turn': {
      const result = resolveBattleTransition({ state, context, action: { type: 'advance_turn' }, rng });
      return withWinner({ state: result.state, context: result.context, events: result.events });
    }

    // Skip may advance the queue and trigger round effects.
    case 'battle_skip_turn': {
      const result = resolveBattleTransition({ state, context, action: { type: 'skip_turn', reason: action.reason }, rng });
      return withWinner({ state: result.state, context: result.context, events: result.events });
    }

    // Current charge never deals damage, but check defensively.
    case 'battle_charge_turn': {
      const result = resolveBattleTransition({ state, context, action: { type: 'charge_turn' }, rng });
      return withWinner({ state: result.state, context: result.context, events: result.events });
    }

    // One quick-battle iteration: quick_turn → advance_turn → game-over.
    // Does NOT loop — the caller iterates.
    case 'battle_quick_turn': {
      const quick    = resolveBattleTransition({ state, context, action: { type: 'quick_turn', unitId: action.unitId }, rng });
      const advanced = resolveBattleTransition({ state: quick.state, context: quick.context, action: { type: 'advance_turn' }, rng });
      const events   = [...quick.events, ...advanced.events];
      return withWinner({ state: advanced.state, context: advanced.context, events });
    }

    // Decides what the auto unit will do — no state mutation.
    case 'battle_decide_auto_turn': {
      const decision = decideAutoTurn({ state, mode, rng });

      switch (decision.type) {
        case 'none':
          return { state, context, events: [], autoTurnDirective: decision };

        case 'handoff_manual':
          return { state, context, events: [], autoTurnDirective: { type: 'handoff_manual' } };

        case 'restart_turn':
          return { state, context, events: [], autoTurnDirective: { type: 'restart_turn' } };

        case 'skip_turn': {
          const activeUnit = state.units.get(decision.unitId)!;
          const intention: AutoTurnIntention = {
            type:           'skip_turn',
            unitId:         decision.unitId,
            skillIndex:     decision.skillIndex,
            reason:         decision.reason,
            activeUnitSide: activeUnit.side,
          };
          return { state, context, events: [], autoTurnDirective: { type: 'intention', intention, animateAttack: false } };
        }

        case 'advance_turn': {
          const activeUnit = state.units.get(decision.unitId)!;
          const intention: AutoTurnIntention = {
            type:           'advance_turn',
            unitId:         decision.unitId,
            skillIndex:     decision.skillIndex,
            activeUnitSide: activeUnit.side,
          };
          return { state, context, events: [], autoTurnDirective: { type: 'intention', intention, animateAttack: false } };
        }

        case 'use_skill': {
          const activeUnit = state.units.get(decision.unitId)!;
          const intention: AutoTurnIntention = {
            type:           'use_skill',
            unitId:         decision.unitId,
            skillIndex:     decision.skillIndex,
            target:         decision.target,
            activeUnitSide: activeUnit.side,
          };
          return { state, context, events: [], autoTurnDirective: { type: 'intention', intention, animateAttack: true } };
        }

        default: {
          const _exhaustive: never = decision;
          throw new Error(`Unexpected auto-turn decision: ${JSON.stringify(_exhaustive)}`);
        }
      }
    }

    // Applies the stored intention. Mutates state. Validates for staleness first.
    case 'battle_apply_auto_turn': {
      const intention = input.pendingAutoTurnIntention ?? null;

      if (!intention) {
        return { state, context, events: [], autoTurnApplied: false };
      }

      // Stale-intention guard: the DELAY_AUTO_IMPACT window (200 ms) means state
      // may have changed between decide and apply.
      const intentionUnit = state.units.get(intention.unitId);
      if (
        state.phase === 'end' ||
        state.roundQueue[0] !== intention.unitId ||
        !intentionUnit ||
        !isAlive(intentionUnit)
      ) {
        return { state, context, events: [], autoTurnApplied: false };
      }

      switch (intention.type) {

        case 'skip_turn': {
          // select_skill persists the chosen index. Its events are dropped.
          const selected = resolveBattleTransition({
            state, context, action: { type: 'select_skill', skillIndex: intention.skillIndex }, rng,
          });
          const skipped = resolveBattleTransition({
            state: selected.state, context: selected.context,
            action: { type: 'skip_turn', reason: intention.reason }, rng,
          });
          return { ...withWinner({ state: skipped.state, context: skipped.context, events: skipped.events }), autoTurnApplied: true };
        }

        case 'advance_turn': {
          const selected = resolveBattleTransition({
            state, context, action: { type: 'select_skill', skillIndex: intention.skillIndex }, rng,
          });
          const advanced = resolveBattleTransition({
            state: selected.state, context: selected.context,
            action: { type: 'advance_turn' }, rng,
          });
          return { ...withWinner({ state: advanced.state, context: advanced.context, events: advanced.events }), autoTurnApplied: true };
        }

        case 'use_skill': {
          const result = resolveSkillTurn({
            state,
            context,
            unitId:                intention.unitId,
            target:                intention.target,
            skillIndex:            intention.skillIndex,
            persistSkillSelection: true,
            rng,
          });
          return {
            state:   result.state,
            context: result.context,
            events:  result.events,
            ...(result.winner ? { winner: result.winner } : {}),
            autoTurnApplied: true,
          };
        }

        default: {
          const _exhaustive: never = intention;
          throw new Error(`Unexpected auto-turn intention: ${JSON.stringify(_exhaustive)}`);
        }
      }
    }
  }
}

// ─── Battle Placement Actions ─────────────────────────────────────────────────

export function applyBattlePlacementAction(
  state:  BattleState,
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
      // Bench unit already exists in state.units — get it from deployments.
      const benchUnit = getBenchSlotOccupant(state, action.benchIdx);
      if (!benchUnit) return state;
      return placeBenchUnitOnField(state, benchUnit, action.anchor, action.benchIdx);
      // No nextPlayerId increment — unit already exists.
    }

    case 'swap_bench_with_field': {
      // Both units already exist in state.units — get bench unit from deployments.
      const benchUnit = getBenchSlotOccupant(state, action.benchIdx);
      const fieldUnit = state.units.get(action.fieldUnitId);
      if (!benchUnit || !fieldUnit) return state;
      // fieldAnchor derived inside swapBenchWithField from fieldUnit's deployment.
      return swapBenchWithField(state, benchUnit, action.benchIdx, fieldUnit);
      // No nextPlayerId increment — both units already exist.
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
