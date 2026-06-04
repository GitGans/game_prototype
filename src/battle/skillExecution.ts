// src/battle/skillExecution.ts

import type { BattleState, CellCoord, Unit, ProbabilityEffectEvent } from "./types";
import { isAlive } from "./lifeState";
import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';
import type { BattleEvent } from "./battleEvents";
import type { CombatEvent, EffectEvent } from "./combat";
import {
  resolveAttack,
  resolveHealWithEvents,
  applyEffectApplication,
  applyPeriodicHpEffectApplication,
  applyVampirism,
  resolveProbabilityEffects,
} from "./combat";
import {
  getActiveSkill,
} from "./skillRuntime";
import { compileSkillUsePlan } from './skillPlanCompiler';
import { resolvePlanPattern } from './skillPlanPatterns';
import { getEffectiveUnitPower } from './skillPower';
import { isHostileTargetPolicy, type SkillUseAction, type SkillUsePlan } from './skillUsePlan';
import { resolveSkillTargetsForPolicy } from "./targeting";
import { requireFieldDeployment } from "./deployment";
import { rebuildRemainingQueue } from "./initiative";
import { resolvePattern } from "./skillPatterns";
import {
  resolveReviveTargetsForAction,
  reviveUnitInBattle,
} from './revive';
import type { Rng } from '../shared/random';

// ─── Public contract ───────────────────────────────────────────────────────────

export type SkillExecutionInput = {
  state: BattleState;
  casterId: string;
  target: CellCoord;
  /** Defaults to getActiveSkill(caster) when omitted. */
  skill?: ActionSkillDefinition;
  queueContext: {
    /** Read-only queue context supplied by the turn resolver. */
    chargedThisRound: ReadonlySet<string>;
  };
  rng: Rng;
};

export type SkillExecutionResult = {
  /**
   * Fully updated skill-use state: HP, effects, occupancy, and queue changes
   * caused by skill effects. Normal turn advancement remains outside the
   * executor and is handled by turnResolver.advanceTurn().
   */
  state: BattleState;
  events: BattleEvent[];
};

// ─── Internal step types ──────────────────────────────────────────────────────

type SkillExecutionStepResult = {
  state: BattleState;
  events: BattleEvent[];
};

type DamageStepResult = SkillExecutionStepResult & {
  totalRealDamage: number;
};

type SkillUsePlanExecutionInput = {
  plan: SkillUsePlan;
  state: BattleState;
  casterId: string;
  caster: Unit;
  target: CellCoord;
  // chargedThisRound is needed when an applied effect changes initiative,
  // because the remaining queue must be rebuilt from the current threaded state.
  queueContext: SkillExecutionInput['queueContext'];
  rng: Rng;
};

// Does not carry state — the caller owns the current state reference.
type ResolvedCasterAndSkill = {
  casterId: string;
  caster: Unit;
  skill: ActionSkillDefinition;
};

// ─── Caster/skill resolution ──────────────────────────────────────────────────

function resolveCasterAndSkill(
  input: SkillExecutionInput,
): ResolvedCasterAndSkill | null {
  const caster = input.state.units.get(input.casterId);
  if (!caster || !isAlive(caster)) return null;
  const skill = input.skill ?? getActiveSkill(caster);
  return { casterId: input.casterId, caster, skill };
}

// ─── Event mapping helpers ────────────────────────────────────────────────────

function mapSkillAttackEventsToBattleEvents(input: {
  events: CombatEvent[];
  casterId: string;
  casterName: string;
}): BattleEvent[] {
  const { events, casterId, casterName } = input;
  const result: BattleEvent[] = [];
  for (const e of events) {
    if (e.type === "hit") {
      result.push({
        type: "skill_damage",
        casterId,
        casterName,
        targetId: e.unitId,
        targetName: e.unitName,
        amount: e.damage,
        blocked: false,
      });
    } else if (e.type === "blocked") {
      result.push({
        type: "skill_damage",
        casterId,
        casterName,
        targetId: e.unitId,
        targetName: e.unitName,
        amount: e.damage,
        blocked: true,
      });
    } else if (e.type === "dodged") {
      result.push({
        type: "skill_dodged",
        casterId,
        casterName,
        targetId: e.unitId,
        targetName: e.unitName,
      });
    } else if (e.type === "vampirism_heal") {
      // resolveAttack does not emit this today, but CombatEvent includes the type.
      // Preserving the mapping keeps the extraction contract-faithful.
      result.push({
        type: "vampirism_heal",
        unitId: e.unitId,
        unitName: e.unitName,
        amount: e.amount,
      });
    }
  }
  return result;
}

function mapVampirismEventsToBattleEvents(events: CombatEvent[]): BattleEvent[] {
  const result: BattleEvent[] = [];
  for (const e of events) {
    if (e.type === "vampirism_heal") {
      result.push({
        type: "vampirism_heal",
        unitId: e.unitId,
        unitName: e.unitName,
        amount: e.amount,
      });
    }
  }
  return result;
}

function mapEffectAppliedEventsToBattleEvents(events: EffectEvent[]): BattleEvent[] {
  const result: BattleEvent[] = [];
  for (const e of events) {
    if (e.type === "effect_applied") {
      result.push({
        type: "effect_applied",
        unitId: e.unitId,
        unitName: e.unitName,
        effectDisplayName: e.effectDisplayName,
      });
    }
    // effect_tick_heal, effect_tick_damage, effect_expired come from tickEffects elsewhere.
    // They do not appear from applyEffectBlock and are intentionally not mapped here.
  }
  return result;
}

function mapProbabilityEffectEventsToBattleEvents(events: ProbabilityEffectEvent[]): BattleEvent[] {
  const result: BattleEvent[] = [];
  for (const e of events) {
    if (e.type === "probability_effect_applied") {
      result.push({
        type: "probability_effect_applied",
        unitId: e.unitId,
        unitName: e.unitName,
        displayName: e.displayName,
      });
    } else if (e.type === "probability_effect_failed") {
      result.push({
        type: "probability_effect_failed",
        unitId: e.unitId,
        unitName: e.unitName,
        displayName: e.displayName,
      });
    }
  }
  return result;
}


// ─── Plan action runners ──────────────────────────────────────────────────────

function executeHealAction(input: {
  state: BattleState;
  casterId: string;
  caster: Unit;
  target: CellCoord;
  action: Extract<SkillUseAction, { type: 'heal' }>;
}): SkillExecutionStepResult {
  const { state, casterId, caster, target, action } = input;

  const pattern = resolvePlanPattern(action.matrix);
  const hitCells = resolvePattern(target, pattern);
  const baseHeal = getEffectiveUnitPower(caster, action.powerSource);

  const { state: healed, heals } = resolveHealWithEvents(hitCells, baseHeal, state);

  const events: BattleEvent[] = heals.map((h) => ({
    type: 'skill_heal' as const,
    casterId,
    casterName: caster.name,
    targetId: h.unitId,
    targetName: h.unitName,
    amount: h.amount,
  }));

  return { state: healed, events };
}

function executeDamageAction(input: {
  state: BattleState;
  casterId: string;
  caster: Unit;
  target: CellCoord;
  action: Extract<SkillUseAction, { type: 'damage' }>;
  rng: Rng;
}): DamageStepResult {
  const { state, casterId, caster, target, action, rng } = input;

  const pattern = resolvePlanPattern(action.matrix);
  const hitCells = resolvePattern(target, pattern);
  const baseDamage = getEffectiveUnitPower(caster, action.powerSource);

  const attackResult = resolveAttack(hitCells, baseDamage, action.powerSource, state, {
    damageModifiers: action.modifiers,
    rng,
  });

  const events = mapSkillAttackEventsToBattleEvents({
    events: attackResult.events,
    casterId,
    casterName: caster.name,
  });

  return { state: attackResult.state, events, totalRealDamage: attackResult.totalRealDamage };
}

function executePostDamageAction(input: {
  state: BattleState;
  caster: Unit;
  action: Extract<SkillUseAction, { type: 'post_damage' }>;
  totalRealDamage: number;
}): SkillExecutionStepResult {
  const { state, caster, action, totalRealDamage } = input;

  if (totalRealDamage <= 0) return { state, events: [] };

  const { state: afterVamp, events: vampEvents } = applyVampirism(
    action.postDamage,
    caster,
    totalRealDamage,
    state,
  );

  return { state: afterVamp, events: mapVampirismEventsToBattleEvents(vampEvents) };
}

function executeApplyStatEffectAction(input: {
  state: BattleState;
  target: CellCoord;
  queueContext: SkillExecutionInput['queueContext'];
  action: Extract<SkillUseAction, { type: 'apply_stat_effect' }>;
}): SkillExecutionStepResult {
  const { state, target, queueContext, action } = input;

  const pattern = resolvePlanPattern(action.matrix);
  const { state: withEffect, events: effEvents } = applyEffectApplication(
    action.effect,
    pattern,
    target,
    state,
    action.resolvedEffect,
  );

  const events = mapEffectAppliedEventsToBattleEvents(effEvents);

  if ((action.resolvedEffect.initiativeBonus ?? 0) !== 0) {
    // Queue rebuild is required when an effect changes initiative order.
    // roundQueue[0] is the current acting unit; rebuild applies to the remaining queue.
    return {
      state: {
        ...withEffect,
        roundQueue: rebuildRemainingQueue(
          withEffect.roundQueue[0],
          withEffect.roundQueue.slice(1),
          queueContext.chargedThisRound,
          withEffect.units,
        ),
      },
      events,
    };
  }

  return { state: withEffect, events };
}

function executeApplyPeriodicHpEffectAction(input: {
  state: BattleState;
  caster: Unit;
  target: CellCoord;
  queueContext: SkillExecutionInput['queueContext'];
  action: Extract<SkillUseAction, { type: 'apply_periodic_hp_effect' }>;
}): SkillExecutionStepResult {
  const { state, caster, target, queueContext, action } = input;

  const pattern = resolvePlanPattern(action.matrix);
  const basePower = getEffectiveUnitPower(caster, action.powerSource);

  const { state: withEffect, events: effEvents } = applyPeriodicHpEffectApplication(
    action.effect,
    pattern,
    target,
    state,
    action.displayEffect,
    {
      direction: action.direction,
      basePower,
    },
  );

  const events = mapEffectAppliedEventsToBattleEvents(effEvents);

  if ((action.displayEffect.initiativeBonus ?? 0) !== 0) {
    return {
      state: {
        ...withEffect,
        roundQueue: rebuildRemainingQueue(
          withEffect.roundQueue[0],
          withEffect.roundQueue.slice(1),
          queueContext.chargedThisRound,
          withEffect.units,
        ),
      },
      events,
    };
  }

  return { state: withEffect, events };
}

// ─── Revive action runner ─────────────────────────────────────────────────────

function executeReviveAction(input: {
  state: BattleState;
  casterId: string;
  caster: Unit;
  target: CellCoord;
  action: Extract<SkillUseAction, { type: 'revive' }>;
}): SkillExecutionStepResult {
  const { state, casterId, caster, target, action } = input;

  const { targets } = resolveReviveTargetsForAction({
    units: state.units,
    deployments: state.deployments,
    casterSide: caster.side,
    targetAnchor: target,
    matrix: action.matrix,
  });

  if (targets.length === 0) return { state, events: [] };

  let currentState = state;
  const events: BattleEvent[] = [];

  for (const { unit: corpse } of targets) {
    const result = reviveUnitInBattle(currentState, corpse.id, action.revive);
    if (!result) continue;

    currentState = result.state;
    events.push({
      type: 'unit_revived',
      casterId,
      casterName: caster.name,
      targetId: corpse.id,
      targetName: corpse.name,
      amount: result.hpRestored,
    });
  }

  return { state: currentState, events };
}

// ─── Counter-attack step ──────────────────────────────────────────────────────

function resolveProvokeCounterAttack(input: {
  state: BattleState;
  casterId: string;
  provokedUnitId: string;
  queueContext: SkillExecutionInput['queueContext'];
  rng: Rng;
}): SkillExecutionStepResult {
  const { casterId, provokedUnitId, queueContext, rng } = input;
  let state = input.state;

  const provokedUnit = state.units.get(provokedUnitId);
  if (!provokedUnit || !isAlive(provokedUnit)) return { state, events: [] };

  // Re-check queue eligibility at dispatch time because nested counter-attacks
  // can consume units that were eligible when the original probability-effect list
  // was resolved.
  const canStillAct = state.roundQueue.slice(1).includes(provokedUnitId);
  if (!canStillAct) return { state, events: [] };

  // Counter-attack is an interrupt inside the original actor's turn.
  // Do not promote the counter-attacker to roundQueue[0].
  // The provoked unit is removed from roundQueue before executing its first skill,
  // so probability effects can only consume turns from units still in roundQueue.slice(1).
  state = {
    ...state,
    roundQueue: state.roundQueue.filter((id) => id !== provokedUnitId),
  };

  const originalCaster = state.units.get(casterId);
  if (!originalCaster || !isAlive(originalCaster)) {
    return {
      state,
      events: [{
        type: "counter_attack_unavailable",
        unitId: provokedUnitId,
        unitName: provokedUnit.name,
        reason: "caster_dead",
      }],
    };
  }

  const counterSkill = provokedUnit.skills[0];
  if (!counterSkill) {
    return {
      state,
      events: [{
        type: "counter_attack_unavailable",
        unitId: provokedUnitId,
        unitName: provokedUnit.name,
        reason: "no_basic_attack",
      }],
    };
  }

  const plan = compileSkillUsePlan(counterSkill);

  const provokedAnchor = requireFieldDeployment(state, provokedUnit.id).anchor;
  const validTargets = resolveSkillTargetsForPolicy(
    plan.targetPolicy,
    state,
    provokedAnchor,
  );

  const casterAnchor = requireFieldDeployment(state, originalCaster.id).anchor;
  const casterIsReachable = validTargets.some(
    (c) =>
      c.side === casterAnchor.side &&
      c.row  === casterAnchor.row  &&
      c.col  === casterAnchor.col,
  );

  if (!casterIsReachable) {
    const isHostile = isHostileTargetPolicy(plan.targetPolicy);

    return {
      state,
      events: [{
        type: "counter_attack_unavailable",
        unitId: provokedUnitId,
        unitName: provokedUnit.name,
        reason: isHostile ? "out_of_range" : "no_basic_attack",
        targetName: isHostile ? originalCaster.name : undefined,
      }],
    };
  }

  const counterResult = executeSkillUsePlan({
    plan,
    state,
    casterId: provokedUnit.id,
    caster: provokedUnit,
    target: casterAnchor,
    queueContext,
    rng,
  });

  return {
    state: counterResult.state,
    events: [
      {
        type: "counter_attack_start",
        attackerId: provokedUnitId,
        attackerName: provokedUnit.name,
        targetId: originalCaster.id,
        targetName: originalCaster.name,
      },
      ...counterResult.events,
    ],
  };
}

// ─── Probability effect action runner ────────────────────────────────────────

function executeProbabilityEffectAction(input: {
  state: BattleState;
  casterId: string;
  target: CellCoord;
  action: Extract<SkillUseAction, { type: 'probability_effect' }>;
  queueContext: SkillExecutionInput['queueContext'];
  rng: Rng;
}): SkillExecutionStepResult {
  const { casterId, target, action, queueContext, rng } = input;

  const pattern = resolvePlanPattern(action.matrix);
  const {
    events: probabilityEvents,
    provokedUnitIds,
    distractedUnitIds,
  } = resolveProbabilityEffects(
    action.probabilityEffect,
    pattern,
    target,
    input.state,
    input.state.roundQueue,
    rng,
  );

  const events: BattleEvent[] = mapProbabilityEffectEventsToBattleEvents(probabilityEvents);
  let next = input.state;

  for (const unitId of distractedUnitIds) {
    const unit = next.units.get(unitId);
    if (!unit) continue;
    next = { ...next, roundQueue: next.roundQueue.filter((id) => id !== unitId) };
    events.push({ type: 'unit_distracted', unitId: unit.id, unitName: unit.name });
  }

  for (const provokedUnitId of provokedUnitIds) {
    const { state: afterCounter, events: counterEvents } = resolveProvokeCounterAttack({
      state: next,
      casterId,
      provokedUnitId,
      queueContext,
      rng,
    });
    next = afterCounter;
    events.push(...counterEvents);
  }

  return { state: next, events };
}

// ─── Plan executor ────────────────────────────────────────────────────────────

function executeSkillUsePlan(input: SkillUsePlanExecutionInput): SkillExecutionResult {
  let state = input.state;
  const events: BattleEvent[] = [];
  let lastTotalRealDamage = 0;

  for (const action of input.plan.actions) {
    switch (action.type) {
      case 'heal': {
        const step = executeHealAction({
          state,
          casterId: input.casterId,
          caster: input.caster,
          target: input.target,
          action,
        });
        state = step.state;
        events.push(...step.events);
        break;
      }

      case 'damage': {
        const step = executeDamageAction({
          state,
          casterId: input.casterId,
          caster: input.caster,
          target: input.target,
          action,
          rng: input.rng,
        });
        state = step.state;
        events.push(...step.events);
        lastTotalRealDamage = step.totalRealDamage;
        break;
      }

      case 'post_damage': {
        const step = executePostDamageAction({
          state,
          caster: input.caster,
          action,
          totalRealDamage: lastTotalRealDamage,
        });
        state = step.state;
        events.push(...step.events);
        break;
      }

      case 'apply_stat_effect': {
        const step = executeApplyStatEffectAction({
          state,
          target: input.target,
          queueContext: input.queueContext,
          action,
        });
        state = step.state;
        events.push(...step.events);
        break;
      }

      case 'apply_periodic_hp_effect': {
        const step = executeApplyPeriodicHpEffectAction({
          state,
          caster: input.caster,
          target: input.target,
          queueContext: input.queueContext,
          action,
        });
        state = step.state;
        events.push(...step.events);
        break;
      }

      case 'probability_effect': {
        const step = executeProbabilityEffectAction({
          state,
          casterId: input.casterId,
          target: input.target,
          action,
          queueContext: input.queueContext,
          rng: input.rng,
        });
        state = step.state;
        events.push(...step.events);
        break;
      }

      case 'revive': {
        const step = executeReviveAction({
          state,
          casterId: input.casterId,
          caster: input.caster,
          target: input.target,
          action,
        });
        state = step.state;
        events.push(...step.events);
        break;
      }

      default: {
        const _exhaustive: never = action;
        return _exhaustive;
      }
    }
  }

  return { state, events };
}

// ─── Executor ─────────────────────────────────────────────────────────────────

/**
 * Applies a skill use to the given state and returns the resulting state + event log.
 * Battle-layer only — no Phaser, no GameState, no EventBus.
 *
 * Execution order comes from SkillUsePlan.actions, compiled by compileSkillUsePlan.
 *
 * Does NOT call: advanceTurn, tickEffects, checkGameOver.
 */
export function executeSkillUse(input: SkillExecutionInput): SkillExecutionResult {
  const resolved = resolveCasterAndSkill(input);
  if (!resolved) return { state: input.state, events: [] };

  const plan = compileSkillUsePlan(resolved.skill);

  return executeSkillUsePlan({
    plan,
    state: input.state,
    casterId: resolved.casterId,
    caster: resolved.caster,
    target: input.target,
    queueContext: input.queueContext,
    rng: input.rng,
  });
}
