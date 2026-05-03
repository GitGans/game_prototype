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
  getSkillHitCellsForSkill,
  isEnchantmentSkill,
  resolveEffectArgs,
} from "./skillRuntime";
import {
  getEffectPattern,
  getInstantEffectPattern,
  getSkillPattern,
} from "./skillDefinitionRuntime";
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

// ─── Shared effect step ───────────────────────────────────────────────────────

// Effect step — shared by both enchantment-targeted and hostile-targeted flows.
//
// Current rules:
// - effectBlock is independent from the heal/damage step. Any skill can carry one.
// - It can represent a buff, debuff, DoT-style effect (lose_health), or HoT-style effect (regeneration).
// - Per-turn HP scaling (for stat-based effects) is resolved by resolveEffectArgs, which reads
//   LEVELED_EFFECTS.effectDamageType — not SkillEffectBlock.damageType.
// - Queue rebuild only happens when the resolved effect has a non-zero initiativeBonus.
function applyLegacyEffectBlock(input: {
  state: BattleState;
  skill: Skill;
  caster: Unit;
  target: CellCoord;
  queueContext: SkillExecutionInput["queueContext"];
}): SkillExecutionStepResult {
  const { state, skill, caster, target, queueContext } = input;

  if (!skill.effectBlock) return { state, events: [] };

  const [eff, perTurn] = resolveEffectArgs(skill, caster);
  const { state: withEffect, events: effEvents } = applyEffectBlock(
    skill.effectBlock,
    getEffectPattern(skill.effectBlock),
    target,
    state,
    eff,
    perTurn,
  );

  const events = mapEffectAppliedEventsToBattleEvents(effEvents);

  if ((eff.initiativeBonus ?? 0) !== 0) {
    // Queue rebuild is required when an effect changes initiative order.
    // roundQueue[0] is the current acting unit; rebuild applies to the remaining queue.
    const nextState: BattleState = {
      ...withEffect,
      roundQueue: rebuildRemainingQueue(
        withEffect.roundQueue[0],
        withEffect.roundQueue.slice(1),
        queueContext.chargedThisRound,
        withEffect.units,
      ),
    };
    return { state: nextState, events };
  }

  return { state: withEffect, events };
}

// ─── Enchantment heal step ────────────────────────────────────────────────────

// Compatibility healing step for enchantment-targeted skills.
//
// Current rules (not the future model):
// - mass_enchantment / self_enchantment are targeting categories, not inherent heal semantics.
//   The heal is a current compatibility rule: enchantment-targeted skill => healing step runs.
// - Hit pattern comes from getSkillHitCellsForSkill, which falls back to the single-cell
//   matrix when damageBlock is absent — so this step always runs, even with no damageBlock.
// - Heal amount uses caster.magicalDamage directly (not effectiveStats). This is legacy
//   scaling; the future model should express this as an explicit power source.
// - DamageBlock.damageType is NOT read for heal amount. The damageType field on damageBlock
//   is irrelevant to the heal path.
function applyLegacyEnchantmentHealing(input: {
  state: BattleState;
  casterId: string;
  caster: Unit;
  skill: Skill;
  target: CellCoord;
}): SkillExecutionStepResult {
  const { state, casterId, caster, skill, target } = input;
  const casterName = caster.name;

  const { state: healed, heals } = resolveHealWithEvents(
    getSkillHitCellsForSkill(skill, target),
    caster.magicalDamage,
    state,
  );

  const events: BattleEvent[] = heals.map((h) => ({
    type: "skill_heal" as const,
    casterId,
    casterName,
    targetId: h.unitId,
    targetName: h.unitName,
    amount: h.amount,
  }));

  return { state: healed, events };
}

// ─── Hostile damage step ──────────────────────────────────────────────────────

// Damage step for hostile-targeted skills.
//
// Current rules (not the future model):
// - Hostile skills always resolve a damage step, even when damageBlock is absent.
// - Missing damageBlock falls back to single-cell physical damage (via getSkillHitCellsForSkill).
//   This fallback must be preserved during normalization — hostile skills without damageBlock
//   are not pure-effect skills; they silently carry a physical damage action.
// - damageBlock?.damageType ?? "physical" selects BOTH the source stat branch AND the defense branch:
//     physical => caster.physicalDamage vs target.physicalDefense
//     magical  => caster.magicalDamage  vs target.magicalDefense
// - effectiveStats() is used for attacker stats (unlike enchantment healing which uses raw magicalDamage).
// - Future model should replace the damageType-selects-both coupling with an explicit power source.
function applyLegacyHostileDamage(input: {
  state: BattleState;
  casterId: string;
  caster: Unit;
  skill: Skill;
  target: CellCoord;
  rng: Rng;
}): { state: BattleState; events: BattleEvent[]; totalRealDamage: number } {
  const { state, casterId, caster, skill, target, rng } = input;
  const casterName = caster.name;

  const damageType = skill.damageBlock?.damageType ?? "physical";
  const casterStats = effectiveStats(caster);
  const baseDamage =
    damageType === "physical"
      ? casterStats.physicalDamage
      : casterStats.magicalDamage;

  const attackResult = resolveAttack(
    getSkillHitCellsForSkill(skill, target),
    baseDamage,
    damageType,
    state,
    { damageModifierBlocks: skill.damageModifierBlocks, rng },
  );

  const events = mapSkillAttackEventsToBattleEvents({
    events: attackResult.events,
    casterId,
    casterName,
  });

  return {
    state: attackResult.state,
    events,
    totalRealDamage: attackResult.totalRealDamage,
  };
}

// ─── Post-damage step ─────────────────────────────────────────────────────────

function applyLegacyPostDamageBlock(input: {
  state: BattleState;
  skill: Skill;
  caster: Unit;
  totalRealDamage: number;
}): SkillExecutionStepResult {
  const { state, skill, caster, totalRealDamage } = input;

  if (!skill.postDamageBlock || totalRealDamage <= 0) {
    return { state, events: [] };
  }

  const { state: afterVamp, events: vampEvents } = applyVampirism(
    skill.postDamageBlock,
    caster,
    totalRealDamage,
    state,
  );

  return {
    state: afterVamp,
    events: mapVampirismEventsToBattleEvents(vampEvents),
  };
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

// ─── Instant effect step ──────────────────────────────────────────────────────

function applyLegacyInstantEffectBlock(input: {
  state: BattleState;
  casterId: string;
  target: CellCoord;
  skill: Skill;
  rng: Rng;
}): SkillExecutionStepResult {
  const { state, casterId, target, skill, rng } = input;

  if (!skill.instantEffectBlock) return { state, events: [] };

  const block = skill.instantEffectBlock;
  const pattern = getInstantEffectPattern(block);
  const {
    events: ieEvents,
    provokedUnitIds,
    distractedUnitIds,
  } = resolveInstantEffects(block, pattern, target, state, state.roundQueue, rng);

  const events: BattleEvent[] = mapInstantEffectEventsToBattleEvents(ieEvents);
  let next = state;

  // ── Distracted: remove from queue ─────────────────────────────────────────
  for (const unitId of distractedUnitIds) {
    const unit = next.units.get(unitId);
    if (!unit) continue;
    next = {
      ...next,
      roundQueue: next.roundQueue.filter((id) => id !== unitId),
    };
    events.push({ type: "unit_distracted", unitId: unit.id, unitName: unit.name });
  }

  // ── Provoked: counter-attack sequence ─────────────────────────────────────
  for (const provokedUnitId of provokedUnitIds) {
    const { state: afterCounter, events: counterEvents } =
      resolveLegacyProvokeCounterAttack({ state: next, casterId, provokedUnitId, rng });
    next = afterCounter;
    events.push(...counterEvents);
  }

  return { state: next, events };
}

// ─── Flow: enchantment-targeted ───────────────────────────────────────────────

// Enchantment-targeted means friendly/self targeting. It is not synonymous
// with heal. The healing step exists for current compatibility only.
function executeEnchantmentTargetedLegacyFlow(input: {
  state: BattleState;
  casterId: string;
  caster: Unit;
  skill: Skill;
  target: CellCoord;
  queueContext: SkillExecutionInput["queueContext"];
}): SkillExecutionResult {
  const { state: s1, events: e1 } = applyLegacyEnchantmentHealing(input);

  const { state: s2, events: e2 } = applyLegacyEffectBlock({
    state: s1,
    skill: input.skill,
    caster: input.caster,
    target: input.target,
    queueContext: input.queueContext,
  });

  return { state: s2, events: [...e1, ...e2] };
}

// ─── Flow: hostile-targeted ───────────────────────────────────────────────────

function executeHostileTargetedLegacyFlow(input: {
  state: BattleState;
  casterId: string;
  caster: Unit;
  skill: Skill;
  target: CellCoord;
  queueContext: SkillExecutionInput["queueContext"];
  rng: Rng;
}): SkillExecutionResult {
  const { state: s1, events: e1, totalRealDamage } = applyLegacyHostileDamage(input);

  const { state: s2, events: e2 } = applyLegacyPostDamageBlock({
    state: s1,
    skill: input.skill,
    caster: input.caster,
    totalRealDamage,
  });

  const { state: s3, events: e3 } = applyLegacyEffectBlock({
    state: s2,
    skill: input.skill,
    caster: input.caster,
    target: input.target,
    queueContext: input.queueContext,
  });

  const { state: s4, events: e4 } = applyLegacyInstantEffectBlock({
    state: s3,
    casterId: input.casterId,
    target: input.target,
    skill: input.skill,
    rng: input.rng,
  });

  return { state: s4, events: [...e1, ...e2, ...e3, ...e4] };
}

// ─── Executor ─────────────────────────────────────────────────────────────────

/**
 * Applies a skill use to the given state and returns the resulting state + event log.
 * Battle-layer only — no Phaser, no GameState, no EventBus.
 *
 * Execution order:
 *   enchantment-targeted: healing → effectBlock → initiative rebuild
 *   hostile-targeted:     damage → vampirism → effectBlock → initiative rebuild → instantEffects
 *
 * Does NOT call: advanceTurn, tickEffects, checkGameOver.
 */
export function executeSkillUse(input: SkillExecutionInput): SkillExecutionResult {
  const resolved = resolveCasterAndSkill(input);
  if (!resolved) return { state: input.state, events: [] };

  if (isEnchantmentSkill(resolved.skill)) {
    return executeEnchantmentTargetedLegacyFlow({
      state: input.state,
      casterId: resolved.casterId,
      caster: resolved.caster,
      skill: resolved.skill,
      target: input.target,
      queueContext: input.queueContext,
    });
  }

  return executeHostileTargetedLegacyFlow({
    state: input.state,
    casterId: resolved.casterId,
    caster: resolved.caster,
    skill: resolved.skill,
    target: input.target,
    queueContext: input.queueContext,
    rng: input.rng,
  });
}
