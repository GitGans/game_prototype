import type { BattleMode, BattleState, CellCoord, Unit } from './types';
import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';
import { getActiveSkill } from './skillRuntime';
import { buildRoundQueue, pruneQueue } from './initiative';
import { getLivingFieldUnitEntries, requireFieldDeployment } from './deployment';
import { isAlive } from './lifeState';
import { tickEffects } from './combat';
import type { EffectEvent } from './combat';
import { compileSkillUsePlan } from './skillPlanCompiler';
import { isAliveFriendlyTargetPolicy } from './skillUsePlan';
import { resolveSkillTargetsForPolicy } from './targeting';

// ─── Turn Context ────────────────────────────────────────────────────────────

export type TurnContext = {
  readonly chargedThisRound: ReadonlySet<string>;
};

export function createTurnContext(): TurnContext {
  return { chargedThisRound: new Set<string>() };
}

export function resetTurnContextForNewBattle(): TurnContext {
  return { chargedThisRound: new Set<string>() };
}

export function getSkillQueueContext(
  context: TurnContext,
): { chargedThisRound: ReadonlySet<string> } {
  return { chargedThisRound: context.chargedThisRound };
}

export function hasChargedThisRound(
  context: TurnContext,
  unitId: string | undefined,
): boolean {
  if (!unitId) return false;
  return context.chargedThisRound.has(unitId);
}

// ─── Turn Events ─────────────────────────────────────────────────────────────

export type TurnEvent =
  | {
      type: 'turn_skipped';
      unitId: string;
      unitName: string;
      reason: 'manual_skip' | 'blocked_melee';
    }
  | {
      type: 'turn_charged';
      unitId: string;
      unitName: string;
    }
  | {
      type: 'round_effect';
      event: EffectEvent;
    };

// ─── Queue Advancement ───────────────────────────────────────────────────────

export type AdvanceTurnResult = {
  state: BattleState;
  context: TurnContext;
  events: TurnEvent[];
};

export function advanceTurn(input: {
  state: BattleState;
  context: TurnContext;
}): AdvanceTurnResult {
  const { state, context } = input;
  const events: TurnEvent[] = [];

  let remaining = state.roundQueue.slice(1);
  remaining = pruneQueue(remaining, state.units);

  let newContext = context;
  let newState = state;

  if (remaining.length === 0) {
    // Round end: reset charge tracking and tick all active effects
    newContext = { chargedThisRound: new Set<string>() };
    const { state: ticked, events: effectEvents } = tickEffects(state);
    newState = ticked;
    for (const e of effectEvents) {
      events.push({ type: 'round_effect', event: e });
    }
    remaining = buildRoundQueue(new Map(getLivingFieldUnitEntries(newState)));
  }

  return {
    state: { ...newState, roundQueue: remaining, validTargets: [] },
    context: newContext,
    events,
  };
}

// ─── Manual Skip ─────────────────────────────────────────────────────────────

export type SkipTurnResult = AdvanceTurnResult & {
  skipped: boolean;
};

export function skipActiveTurn(input: {
  state: BattleState;
  context: TurnContext;
  reason?: 'manual_skip' | 'blocked_melee';
}): SkipTurnResult {
  const { state, context, reason = 'manual_skip' } = input;
  const activeUnit = state.units.get(state.roundQueue[0]);
  if (!activeUnit || !isAlive(activeUnit)) {
    // Stale skip on a missing/dead active unit. Recover through advanceTurn
    // so the queue cannot stall on a dead roundQueue[0]; do not emit a
    // turn_skipped event because no skip semantically occurred.
    const advanced = advanceTurn({ state, context });
    return {
      state: advanced.state,
      context: advanced.context,
      events: advanced.events,
      skipped: false,
    };
  }

  const skipEvent: TurnEvent = {
    type: 'turn_skipped',
    unitId: activeUnit.id,
    unitName: activeUnit.name,
    reason,
  };

  const advanced = advanceTurn({ state, context });
  return {
    state: advanced.state,
    context: advanced.context,
    events: [skipEvent, ...advanced.events],
    skipped: true,
  };
}

// ─── Manual Charge ───────────────────────────────────────────────────────────

export type ChargeTurnResult = {
  state: BattleState;
  context: TurnContext;
  events: TurnEvent[];
  charged: boolean;
  /**
   * True ONLY for the already-charged no-op: state and context are returned unchanged. The
   * dead-active recovery is not a refusal — it advances the queue — so it reports false.
   */
  refused: boolean;
};

export function chargeActiveTurn(input: {
  state: BattleState;
  context: TurnContext;
}): ChargeTurnResult {
  const { state, context } = input;
  const activeId = state.roundQueue[0];
  const activeUnit = state.units.get(activeId);

  // Recovery: stale manual charge arrived after the active unit died/disappeared.
  // Advance through advanceTurn so the queue cannot stall; no turn_charged event.
  if (!activeUnit || !isAlive(activeUnit)) {
    const advanced = advanceTurn({ state, context });
    return {
      state: advanced.state,
      context: advanced.context,
      events: advanced.events,
      charged: false,
      refused: false,
    };
  }

  // Already-charged remains a true no-op (legitimate UI-level rejection of a
  // double-tap on a unit that already charged this round).
  if (context.chargedThisRound.has(activeId)) {
    return { state, context, events: [], charged: false, refused: true };
  }

  // Immutable context update — never mutate the existing Set
  const newCharged = new Set(context.chargedThisRound);
  newCharged.add(activeId);
  const newContext: TurnContext = { chargedThisRound: newCharged };

  let remaining = state.roundQueue.slice(1);
  remaining = pruneQueue(remaining, state.units);

  let newQueue: string[];
  if (remaining.length === 0) {
    // Edge case: unit was last. Move it to the end of the NEXT round's queue.
    newQueue = buildRoundQueue(new Map(getLivingFieldUnitEntries(state))).filter((id) => id !== activeId);
    newQueue.push(activeId);
  } else {
    // Standard case: append the active unit at the end of the remaining queue.
    newQueue = [...remaining, activeId];
  }

  const chargeEvent: TurnEvent = {
    type: 'turn_charged',
    unitId: activeUnit.id,
    unitName: activeUnit.name,
  };

  return {
    state: { ...state, roundQueue: newQueue, validTargets: [] },
    context: newContext,
    events: [chargeEvent],
    charged: true,
    refused: false,
  };
}

// ─── Turn Start Resolver ─────────────────────────────────────────────────────

export type TurnStartDirective =
  | { type: 'none'; reason: 'battle_ended' | 'quick_mode' | 'empty_queue' }
  | { type: 'continue_immediately' }
  | {
      type: 'schedule_auto_turn';
      activeUnitId: string;
      delayKind: 'auto_player' | 'auto_enemy';
    }
  /**
   * A living player unit in manual mode whose selected skill has no valid targets. Control stays
   * with the player: the action bar is shown (other skills, an eligible item, skip, charge), but
   * there is no targeting prompt. Deliberately NOT `await_manual_target` with an empty list —
   * there is nothing to click on the grid.
   */
  | { type: 'await_manual_action'; activeUnitId: string }
  | {
      type: 'await_manual_target';
      activeUnitId: string;
      activeSkill: ActionSkillDefinition;
      validTargets: CellCoord[];
      promptKind: 'attack' | 'heal';
    };

export type TurnStartResult = {
  state: BattleState;
  context: TurnContext;
  events: TurnEvent[];
  directive: TurnStartDirective;
};

export function resolveActiveTurnStart(input: {
  state: BattleState;
  context: TurnContext;
  mode: BattleMode;
}): TurnStartResult {
  const { context, mode } = input;
  let { state } = input;

  // 1. Battle already over
  if (state.phase === 'end') {
    return { state, context, events: [], directive: { type: 'none', reason: 'battle_ended' } };
  }

  // 2. Quick mode — caller handles the entire loop
  if (mode === 'quick') {
    return { state, context, events: [], directive: { type: 'none', reason: 'quick_mode' } };
  }

  // 3. Empty queue
  const activeId = state.roundQueue[0];
  if (!activeId) {
    return { state, context, events: [], directive: { type: 'none', reason: 'empty_queue' } };
  }

  // 4. Active unit missing or dead — silent technical recovery, round effects preserved
  const activeUnit = state.units.get(activeId);
  if (!activeUnit || !isAlive(activeUnit)) {
    const advanced = advanceTurn({ state, context });
    return {
      state: advanced.state,
      context: advanced.context,
      events: advanced.events,
      directive: { type: 'continue_immediately' },
    };
  }

  // 5. Reset active unit skill index to 0 at turn start
  if (activeUnit.activeSkillIndex !== 0) {
    const updated = { ...activeUnit, activeSkillIndex: 0 };
    const units = new Map(state.units);
    units.set(activeId, updated);
    state = { ...state, units };
  }
  const currentUnit = state.units.get(activeId)!;

  // 6. Player unit in auto mode
  if (currentUnit.side === 'player' && mode === 'auto') {
    return {
      state: { ...state, phase: 'select_target', validTargets: [] },
      context,
      events: [],
      directive: { type: 'schedule_auto_turn', activeUnitId: activeId, delayKind: 'auto_player' },
    };
  }

  // 7. Enemy unit — always auto
  if (currentUnit.side === 'enemy') {
    return {
      state: { ...state, phase: 'select_target', validTargets: [] },
      context,
      events: [],
      directive: { type: 'schedule_auto_turn', activeUnitId: activeId, delayKind: 'auto_enemy' },
    };
  }

  // 8. Player unit in manual mode — control always stays with the player.
  //    A selected skill without targets is not a reason to take the turn away: the player may pick
  //    another skill, use an item, skip or charge. No event, no queue/round/effect/HP/charge change,
  //    no RNG. (Missing/dead recovery in step 4 is different: it advances a stale queue entry, it
  //    does not act on behalf of a living player.)
  const currentSkill  = getActiveSkill(currentUnit);
  const currentPlan   = compileSkillUsePlan(currentSkill);
  const currentAnchor = requireFieldDeployment(state, currentUnit.id).anchor;
  const validTargets  = resolveSkillTargetsForPolicy(
    currentPlan.targetPolicy,
    state,
    currentAnchor,
  );
  const waitingState: BattleState = { ...state, phase: 'select_target', validTargets };

  if (validTargets.length === 0) {
    return {
      state: waitingState,
      context,
      events: [],
      directive: { type: 'await_manual_action', activeUnitId: activeId },
    };
  }

  return {
    state: waitingState,
    context,
    events: [],
    directive: {
      type: 'await_manual_target',
      activeUnitId: activeId,
      activeSkill: currentSkill,
      validTargets,
      promptKind:
        isAliveFriendlyTargetPolicy(currentPlan.targetPolicy) ||
        currentPlan.targetPolicy.type === 'self'
          ? 'heal'
          : 'attack',
    },
  };
}

// ─── Manual Skill Switch ─────────────────────────────────────────────────────

export type SwitchActiveSkillResult = {
  state: BattleState;
  activeUnit?: Unit;
  activeSkill?: ActionSkillDefinition;
  // Read-only because the no-op branch returns `state.validTargets` by reference
  // rather than building a replacement.
  validTargets: readonly CellCoord[];
};

export function switchActiveSkillForManualTurn(input: {
  state: BattleState;
  skillIndex: number;
}): SwitchActiveSkillResult {
  const { state, skillIndex } = input;
  const unitId = state.roundQueue[0];
  const activeUnit = state.units.get(unitId);

  if (!activeUnit || !isAlive(activeUnit) || activeUnit.side !== 'player') {
    return { state, validTargets: state.validTargets };
  }

  const updatedUnit: Unit = { ...activeUnit, activeSkillIndex: skillIndex };
  const units = new Map(state.units);
  units.set(unitId, updatedUnit);

  const activeSkill   = updatedUnit.skills[skillIndex] ?? updatedUnit.skills[0];
  const activePlan    = compileSkillUsePlan(activeSkill);
  const updatedAnchor = requireFieldDeployment(state, updatedUnit.id).anchor;
  const validTargets  = resolveSkillTargetsForPolicy(
    activePlan.targetPolicy,
    state,
    updatedAnchor,
  );

  return {
    state: { ...state, units, validTargets },
    activeUnit: updatedUnit,
    activeSkill: activeSkill,
    validTargets,
  };
}
