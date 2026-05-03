// src/battle/skillExecution.ts

import type { BattleState, CellCoord, Skill, Unit, InstantEffectEvent } from "./types";
import type { BattleEvent } from "./battleEvents";
import type { CombatEvent, EffectEvent } from "./combat";
import {
  resolveAttack,
  resolveHealWithEvents,
  applyEffectBlock,
  applyVampirism,
  effectiveStats,
  resolveInstantEffects,
} from "./combat";
import {
  getActiveSkill,
} from "./skillRuntime";
import {
  getSkillPattern,
} from "./skillDefinitionRuntime";
import {
  compileLegacySkill,
  getDamageTypeForPowerSource,
  getEffectiveUnitPower,
  getRawUnitPower,
  resolvePlanPattern,
} from './skillUsePlan';
import type { SkillUseAction, SkillUsePlan } from './skillUsePlan';
import type { PeriodicHp } from '../shared/activeEffect';
import { getMeleeTargets, getRangedTargets } from "./targeting";
import { rebuildRemainingQueue } from "./initiative";
import { resolvePattern } from "./skillPatterns";
import type { Rng } from '../shared/random';

// ─── Public contract ───────────────────────────────────────────────────────────

export type SkillExecutionInput = {
  state: BattleState;
  casterId: string;
  target: CellCoord;
  /** Defaults to getActiveSkill(caster) when omitted. */
  skill?: Skill;
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
  skill: Skill;
};

// ─── Caster/skill resolution ──────────────────────────────────────────────────

function resolveCasterAndSkill(
  input: SkillExecutionInput,
): ResolvedCasterAndSkill | null {
  const caster = input.state.units.get(input.casterId);
  if (!caster) return null;
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

function mapInstantEffectEventsToBattleEvents(events: InstantEffectEvent[]): BattleEvent[] {
  const result: BattleEvent[] = [];
  for (const e of events) {
    if (e.type === "instant_effect_applied") {
      result.push({
        type: "instant_effect_applied",
        unitId: e.unitId,
        unitName: e.unitName,
        displayName: e.displayName,
      });
    } else if (e.type === "instant_effect_failed") {
      result.push({
        type: "instant_effect_failed",
        unitId: e.unitId,
        unitName: e.unitName,
        displayName: e.displayName,
      });
    }
  }
  return result;
}

function mapCounterAttackEventsToBattleEvents(
  events: CombatEvent[],
  attackerId: string,
  attackerName: string,
): BattleEvent[] {
  const result: BattleEvent[] = [];
  for (const e of events) {
    if (e.type === "hit") {
      result.push({
        type: "counter_attack_hit",
        attackerId,
        attackerName,
        targetId: e.unitId,
        targetName: e.unitName,
        amount: e.damage,
        blocked: false,
      });
    } else if (e.type === "blocked") {
      result.push({
        type: "counter_attack_hit",
        attackerId,
        attackerName,
        targetId: e.unitId,
        targetName: e.unitName,
        amount: e.damage,
        blocked: true,
      });
    } else if (e.type === "dodged") {
      result.push({
        type: "counter_attack_dodged",
        attackerId,
        attackerName,
        targetId: e.unitId,
        targetName: e.unitName,
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
  const baseHeal = getRawUnitPower(caster, action.powerSource);

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
  const damageType = getDamageTypeForPowerSource(action.powerSource);
  const baseDamage = getEffectiveUnitPower(caster, action.powerSource);

  const attackResult = resolveAttack(hitCells, baseDamage, damageType, state, {
    damageModifierBlocks: action.modifiers,
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
    action.postDamageBlock,
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
  const { state: withEffect, events: effEvents } = applyEffectBlock(
    action.effectBlock,
    pattern,
    target,
    state,
    action.resolvedEffect,
    undefined,
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

  // Only the anchor cell's multiplier is used for runtime per-turn scaling.
  // Plan action direction is stored in ActiveEffect.periodicHp (Stage 10+).
  // computedPerTurn is passed as a legacy compatibility mirror/fallback.
  const anchorCell = pattern.cells[pattern.anchorRow][pattern.anchorCol]!;
  const computedPerTurn = Math.round(
    getRawUnitPower(caster, action.powerSource) * anchorCell.damageMultiplier,
  );

  const periodicHp: PeriodicHp = {
    direction: action.direction,
    amountPerTurn: computedPerTurn,
  };

  const { state: withEffect, events: effEvents } = applyEffectBlock(
    action.effectBlock,
    pattern,
    target,
    state,
    action.displayEffect,
    computedPerTurn,
    periodicHp,
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

// ─── Counter-attack step ──────────────────────────────────────────────────────

function resolveLegacyProvokeCounterAttack(input: {
  state: BattleState;
  casterId: string;
  provokedUnitId: string;
  rng: Rng;
}): SkillExecutionStepResult {
  const { casterId, provokedUnitId, rng } = input;
  let state = input.state;
  const events: BattleEvent[] = [];

  const provokedUnit = state.units.get(provokedUnitId);
  if (!provokedUnit) return { state, events };

  // Remove provoked unit from queue before any checks.
  state = {
    ...state,
    roundQueue: state.roundQueue.filter((id) => id !== provokedUnitId),
  };

  const caster = state.units.get(casterId);
  if (!caster || caster.hp <= 0) {
    events.push({
      type: "counter_attack_unavailable",
      unitId: provokedUnitId,
      unitName: provokedUnit.name,
      reason: "caster_dead",
    });
    return { state, events };
  }

  const basicSkill = provokedUnit.skills.find(
    (s) => s.actionType === "melee" || s.actionType === "ranged",
  );
  if (!basicSkill?.damageBlock) {
    events.push({
      type: "counter_attack_unavailable",
      unitId: provokedUnitId,
      unitName: provokedUnit.name,
      reason: "no_basic_attack",
    });
    return { state, events };
  }

  const validTargets =
    basicSkill.actionType === "melee"
      ? getMeleeTargets(provokedUnit, state.occupancy)
      : getRangedTargets(provokedUnit.anchor.side, state.occupancy);

  const casterIsReachable = validTargets.some(
    (c) =>
      c.side === caster.anchor.side &&
      c.row === caster.anchor.row &&
      c.col === caster.anchor.col,
  );
  if (!casterIsReachable) {
    events.push({
      type: "counter_attack_unavailable",
      unitId: provokedUnitId,
      unitName: provokedUnit.name,
      reason: "out_of_range",
      targetName: caster.name,
    });
    return { state, events };
  }

  events.push({
    type: "counter_attack_start",
    attackerId: provokedUnitId,
    attackerName: provokedUnit.name,
    targetId: caster.id,
    targetName: caster.name,
  });

  const hitCells = resolvePattern(caster.anchor, getSkillPattern(basicSkill));
  const dmgType = basicSkill.damageBlock.damageType;
  const provokedStats = effectiveStats(provokedUnit);
  const baseDmg =
    dmgType === "physical"
      ? provokedStats.physicalDamage
      : provokedStats.magicalDamage;

  const { state: afterCounter, events: counterEvents } = resolveAttack(
    hitCells,
    baseDmg,
    dmgType,
    state,
    { rng },
  );

  return {
    state: afterCounter,
    events: [
      ...events,
      ...mapCounterAttackEventsToBattleEvents(counterEvents, provokedUnitId, provokedUnit.name),
    ],
  };
}

// ─── Instant effect action runner ─────────────────────────────────────────────

function executeInstantEffectAction(input: {
  state: BattleState;
  casterId: string;
  target: CellCoord;
  action: Extract<SkillUseAction, { type: 'instant_effect' }>;
  rng: Rng;
}): SkillExecutionStepResult {
  const { casterId, target, action, rng } = input;

  const pattern = resolvePlanPattern(action.matrix);
  const {
    events: ieEvents,
    provokedUnitIds,
    distractedUnitIds,
  } = resolveInstantEffects(
    action.instantEffectBlock,
    pattern,
    target,
    input.state,
    input.state.roundQueue,
    rng,
  );

  const events: BattleEvent[] = mapInstantEffectEventsToBattleEvents(ieEvents);
  let next = input.state;

  for (const unitId of distractedUnitIds) {
    const unit = next.units.get(unitId);
    if (!unit) continue;
    next = { ...next, roundQueue: next.roundQueue.filter((id) => id !== unitId) };
    events.push({ type: 'unit_distracted', unitId: unit.id, unitName: unit.name });
  }

  for (const provokedUnitId of provokedUnitIds) {
    const { state: afterCounter, events: counterEvents } = resolveLegacyProvokeCounterAttack({
      state: next,
      casterId,
      provokedUnitId,
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

      case 'instant_effect': {
        const step = executeInstantEffectAction({
          state,
          casterId: input.casterId,
          target: input.target,
          action,
          rng: input.rng,
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
 * Execution order comes from SkillUsePlan.actions, compiled by compileLegacySkill.
 *
 * Does NOT call: advanceTurn, tickEffects, checkGameOver.
 */
export function executeSkillUse(input: SkillExecutionInput): SkillExecutionResult {
  const resolved = resolveCasterAndSkill(input);
  if (!resolved) return { state: input.state, events: [] };

  const plan = compileLegacySkill(resolved.skill);

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
