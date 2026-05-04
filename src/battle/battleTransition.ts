import type { BattleMode, BattleState, CellCoord } from './types';
import type { BattleEvent } from './battleEvents';
import type { Rng } from '../shared/random';
import { turnEventsToBattleEvents } from './battleEventMapping';
import {
  type TurnContext,
  type TurnStartDirective,
  resolveActiveTurnStart,
  switchActiveSkillForManualTurn,
  advanceTurn,
  skipActiveTurn,
  chargeActiveTurn,
  getSkillQueueContext,
} from './turnResolver';
import { executeSkillUse } from './skillExecution';
import { computeOneTurn } from './quickTurn';

// ─── Action Union ────────────────────────────────────────────────────────────

export type BattleAction =
  | { type: 'start_turn'; mode: BattleMode }
  | { type: 'select_skill'; skillIndex: number }
  | { type: 'use_skill'; unitId: string; target: CellCoord; skillIndex?: number }
  | { type: 'advance_turn' }
  | { type: 'skip_turn'; reason?: 'manual_skip' | 'blocked_melee' }
  | { type: 'charge_turn' }
  | { type: 'quick_turn'; unitId: string };

// ─── Result ──────────────────────────────────────────────────────────────────

export type BattleTransitionResult = {
  state: BattleState;
  context: TurnContext;
  events: BattleEvent[];
  directive?: TurnStartDirective;
};

// ─── Facade ──────────────────────────────────────────────────────────────────

export function resolveBattleTransition(input: {
  state: BattleState;
  context: TurnContext;
  action: BattleAction;
  rng: Rng;
}): BattleTransitionResult {
  const { state, context, action, rng } = input;

  switch (action.type) {

    case 'start_turn': {
      const result = resolveActiveTurnStart({ state, context, mode: action.mode });
      return {
        state: result.state,
        context: result.context,
        events: turnEventsToBattleEvents(result.events),
        directive: result.directive,
      };
    }

    case 'select_skill': {
      const result = switchActiveSkillForManualTurn({ state, skillIndex: action.skillIndex });
      return {
        state: result.state,
        context,
        events: [],
      };
    }

    case 'use_skill': {
      const caster = state.units.get(action.unitId);
      // If skillIndex is provided but invalid, fall back to skills[0] — matches
      // the existing skill fallback convention (unit.skills[index] ?? unit.skills[0]).
      // Passing undefined lets executeSkillUse use getActiveSkill(caster) instead,
      // which is a different fallback path and should only trigger when no index is given.
      const skill =
        action.skillIndex !== undefined && caster
          ? (caster.skills[action.skillIndex] ?? caster.skills[0])
          : undefined;

      const result = executeSkillUse({
        state,
        casterId: action.unitId,
        target: action.target,
        skill,
        queueContext: getSkillQueueContext(context),
        rng,
      });

      // Transitional boundary: skill use and normal turn advancement remain separate.
      // Current runtime checks game-over between skill execution and turn advancement.
      // Stage 2 must compose use_skill → game-over check → advance_turn → game-over check
      // inside battlePhaseHandler or a battle-level compound action.
      // PhaseManager must not learn battle sequencing details.
      return {
        state: result.state,
        context,
        events: result.events,
      };
    }

    case 'advance_turn': {
      const result = advanceTurn({ state, context });
      return {
        state: result.state,
        context: result.context,
        events: turnEventsToBattleEvents(result.events),
      };
    }

    case 'skip_turn': {
      const result = skipActiveTurn({ state, context, reason: action.reason });
      return {
        state: result.state,
        context: result.context,
        events: turnEventsToBattleEvents(result.events),
      };
    }

    case 'charge_turn': {
      const result = chargeActiveTurn({ state, context });
      return {
        state: result.state,
        context: result.context,
        events: turnEventsToBattleEvents(result.events),
      };
    }

    case 'quick_turn': {
      const newState = computeOneTurn(state, action.unitId, {
        queueContext: getSkillQueueContext(context),
        rng,
      });
      // quick_turn is state-only in Stage 1: computeOneTurn returns only BattleState.
      // Eventful quick/replay support is future work.
      // Turn advancement is handled separately by the caller via advance_turn.
      return {
        state: newState,
        context,
        events: [],
      };
    }
  }
}

