// src/battle/skillExecution.ts

import type { BattleState, CellCoord, Skill } from './types';
import type { BattleEvent } from './battleEvents';
import {
  resolveAttack,
  resolveHealWithEvents,
  applyEffectBlock,
  applyVampirism,
  effectiveStats,
  resolveInstantEffects,
} from './combat';
import {
  getActiveSkill,
  getSkillHitCellsForSkill,
  isEnchantmentSkill,
  resolveEffectArgs,
} from './skillRuntime';
import {
  getEffectPattern,
  getInstantEffectPattern,
  getSkillPattern,
} from '../data/skillDefinitions';
import { getMeleeTargets, getRangedTargets } from './targeting';
import { rebuildRemainingQueue } from './initiative';
import { resolvePattern } from './skillPatterns';

// ─── Public contract ───────────────────────────────────────────────────────────

export type SkillExecutionInput = {
  state: BattleState;
  casterId: string;
  target: CellCoord;
  /** Defaults to getActiveSkill(caster) when omitted. */
  skill?: Skill;
  queueContext: {
    /** Read-only — lifecycle stays in Game.ts until Stage 4. */
    chargedThisRound: ReadonlySet<string>;
  };
};

export type SkillExecutionResult = {
  /**
   * Fully updated state: HP, effects, occupancy, roundQueue.
   * roundQueue already reflects queue changes from initiative rebuild and
   * instant-effect unit removal — Game.ts only needs to call advanceQueue after.
   */
  state: BattleState;
  events: BattleEvent[];
};

// ─── Executor ─────────────────────────────────────────────────────────────────

/**
 * Applies a skill use to the given state and returns the resulting state + event log.
 * Battle-layer only — no Phaser, no GameState, no EventBus.
 * Not deterministic: resolveAttack uses Math.random() for dodge/block rolls.
 *
 * Execution order (matches current handleTargetSelect):
 *   1. enchantment: resolveHealWithEvents → effectBlock → initiative rebuild
 *   2. attack:      resolveAttack → vampirism → effectBlock → initiative rebuild → instantEffectBlock
 *
 * Does NOT call: advanceQueue, tickEffects, checkGameOver.
 */
export function executeSkillUse(input: SkillExecutionInput): SkillExecutionResult {
  const { casterId, target, queueContext } = input;
  let state = input.state;
  const events: BattleEvent[] = [];

  const caster = state.units.get(casterId);
  if (!caster) return { state, events };

  const skill = input.skill ?? getActiveSkill(caster);
  const casterName = caster.name;

  // ── 1. Enchantment (heal) path ─────────────────────────────────────────────
  if (isEnchantmentSkill(skill)) {
    const { state: healed, heals } = resolveHealWithEvents(
      getSkillHitCellsForSkill(skill, target),
      caster.magicalDamage,
      state,
    );
    state = healed;
    for (const h of heals) {
      events.push({ type: 'skill_heal', casterId, casterName, targetId: h.unitId, targetName: h.unitName, amount: h.amount });
    }

    if (skill.effectBlock) {
      const [eff, perTurn] = resolveEffectArgs(skill, caster);
      const { state: withEffect, events: effEvents } = applyEffectBlock(
        skill.effectBlock, getEffectPattern(skill.effectBlock), target, state, eff, perTurn,
      );
      state = withEffect;
      for (const e of effEvents) {
        events.push({ type: 'effect_applied', unitId: e.unitId, unitName: e.unitName, effectDisplayName: e.effectDisplayName });
      }
      if ((eff.initiativeBonus ?? 0) !== 0) {
        state = {
          ...state,
          roundQueue: rebuildRemainingQueue(
            state.roundQueue[0], state.roundQueue.slice(1),
            queueContext.chargedThisRound, state.units,
          ),
        };
      }
    }

    return { state, events };
  }

  // ── 2. Attack path ─────────────────────────────────────────────────────────
  const damageType = skill.damageBlock?.damageType ?? 'physical';
  const casterStats = effectiveStats(caster);
  const baseDamage = damageType === 'physical' ? casterStats.physicalDamage : casterStats.magicalDamage;

  const attackResult = resolveAttack(
    getSkillHitCellsForSkill(skill, target),
    baseDamage,
    damageType,
    state,
    skill.damageModifierBlocks,
  );
  state = attackResult.state;

  for (const e of attackResult.events) {
    if (e.type === 'hit') {
      events.push({ type: 'skill_damage', casterId, casterName, targetId: e.unitId, targetName: e.unitName, amount: e.damage, blocked: false });
    } else if (e.type === 'blocked') {
      events.push({ type: 'skill_damage', casterId, casterName, targetId: e.unitId, targetName: e.unitName, amount: e.damage, blocked: true });
    } else if (e.type === 'dodged') {
      events.push({ type: 'skill_dodged', casterId, casterName, targetId: e.unitId, targetName: e.unitName });
    } else if (e.type === 'vampirism_heal') {
      events.push({ type: 'vampirism_heal', unitId: e.unitId, unitName: e.unitName, amount: e.amount });
    }
  }

  // Vampirism (postDamageBlock)
  if (skill.postDamageBlock && attackResult.totalRealDamage > 0) {
    const { state: afterVamp, events: vampEvents } = applyVampirism(
      skill.postDamageBlock, caster, attackResult.totalRealDamage, state,
    );
    state = afterVamp;
    for (const e of vampEvents) {
      if (e.type === 'vampirism_heal') {
        events.push({ type: 'vampirism_heal', unitId: e.unitId, unitName: e.unitName, amount: e.amount });
      }
    }
  }

  // effectBlock
  if (skill.effectBlock) {
    const [eff, perTurn] = resolveEffectArgs(skill, caster);
    const { state: withEffect, events: effEvents } = applyEffectBlock(
      skill.effectBlock, getEffectPattern(skill.effectBlock), target, state, eff, perTurn,
    );
    state = withEffect;
    for (const e of effEvents) {
      events.push({ type: 'effect_applied', unitId: e.unitId, unitName: e.unitName, effectDisplayName: e.effectDisplayName });
    }
    if ((eff.initiativeBonus ?? 0) !== 0) {
      state = {
        ...state,
        roundQueue: rebuildRemainingQueue(
          state.roundQueue[0], state.roundQueue.slice(1),
          queueContext.chargedThisRound, state.units,
        ),
      };
    }
  }

  // instantEffectBlock (provoke / distract)
  if (skill.instantEffectBlock) {
    state = applyInstantEffects(state, casterId, target, skill, events);
  }

  return { state, events };
}

// ─── Private: instant effect handler ──────────────────────────────────────────

/**
 * Resolves provoke / distract from skill.instantEffectBlock.
 * Mutates `events` in place (appends), returns updated state.
 */
function applyInstantEffects(
  state: BattleState,
  casterId: string,
  targetCoord: CellCoord,
  skill: Skill,
  events: BattleEvent[],
): BattleState {
  const block = skill.instantEffectBlock!;
  const pattern = getInstantEffectPattern(block);
  const { events: ieEvents, provokedUnitIds, distractedUnitIds } = resolveInstantEffects(
    block, pattern, targetCoord, state, state.roundQueue,
  );

  for (const e of ieEvents) {
    if (e.type === 'instant_effect_applied') {
      events.push({ type: 'instant_effect_applied', unitId: e.unitId, unitName: e.unitName, displayName: e.displayName });
    } else if (e.type === 'instant_effect_failed') {
      events.push({ type: 'instant_effect_failed', unitId: e.unitId, unitName: e.unitName, displayName: e.displayName });
    }
  }

  let next = state;

  // ── Distracted: remove from queue ─────────────────────────────────────────
  for (const unitId of distractedUnitIds) {
    const unit = next.units.get(unitId);
    if (!unit) continue;
    next = { ...next, roundQueue: next.roundQueue.filter(id => id !== unitId) };
    events.push({ type: 'unit_distracted', unitId: unit.id, unitName: unit.name });
  }

  // ── Provoked: remove from queue, then counter-attack ──────────────────────
  for (const unitId of provokedUnitIds) {
    const provokedUnit = next.units.get(unitId);
    if (!provokedUnit) continue;

    next = { ...next, roundQueue: next.roundQueue.filter(id => id !== unitId) };

    const caster = next.units.get(casterId);
    if (!caster || caster.hp <= 0) {
      events.push({ type: 'counter_attack_unavailable', unitId, unitName: provokedUnit.name, reason: 'caster_dead' });
      continue;
    }

    const basicSkill = provokedUnit.skills.find(
      s => s.actionType === 'melee' || s.actionType === 'ranged',
    );
    if (!basicSkill?.damageBlock) {
      events.push({ type: 'counter_attack_unavailable', unitId, unitName: provokedUnit.name, reason: 'no_basic_attack' });
      continue;
    }

    const validTargets = basicSkill.actionType === 'melee'
      ? getMeleeTargets(provokedUnit, next.occupancy)
      : getRangedTargets(provokedUnit.anchor.side, next.occupancy);

    const casterIsReachable = validTargets.some(
      c => c.side === caster.anchor.side && c.row === caster.anchor.row && c.col === caster.anchor.col,
    );
    if (!casterIsReachable) {
      events.push({ type: 'counter_attack_unavailable', unitId, unitName: provokedUnit.name, reason: 'out_of_range', targetName: caster.name });
      continue;
    }

    events.push({ type: 'counter_attack_start', attackerId: unitId, attackerName: provokedUnit.name, targetId: caster.id, targetName: caster.name });

    const hitCells = resolvePattern(caster.anchor, getSkillPattern(basicSkill));
    const dmgType = basicSkill.damageBlock.damageType;
    const provokedStats = effectiveStats(provokedUnit);
    const baseDmg = dmgType === 'physical' ? provokedStats.physicalDamage : provokedStats.magicalDamage;

    const { state: afterCounter, events: counterEvents } = resolveAttack(hitCells, baseDmg, dmgType, next);
    next = afterCounter;

    for (const e of counterEvents) {
      if (e.type === 'hit') {
        events.push({ type: 'counter_attack_hit', attackerId: unitId, attackerName: provokedUnit.name, targetId: e.unitId, targetName: e.unitName, amount: e.damage, blocked: false });
      } else if (e.type === 'blocked') {
        events.push({ type: 'counter_attack_hit', attackerId: unitId, attackerName: provokedUnit.name, targetId: e.unitId, targetName: e.unitName, amount: e.damage, blocked: true });
      } else if (e.type === 'dodged') {
        events.push({ type: 'counter_attack_dodged', attackerId: unitId, attackerName: provokedUnit.name, targetId: e.unitId, targetName: e.unitName });
      }
    }
  }

  return next;
}
