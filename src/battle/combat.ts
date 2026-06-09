import {
  ActiveEffect,
  BattleState,
  CellCoord,
  Effect,
  ProbabilityEffectEvent,
  ResolvedHitCell,
  Side,
  SkillPattern,
  Unit,
} from "./types";
import { getLivingFieldUnits } from "./deployment";
import { isAlive, killUnit } from "./lifeState";
import type {
  AppliedEffectMeta,
  DamageModifierRef,
  DamageModifierType,
  ProbabilityEffectApplication,
  PostDamageEffect,
} from '../shared/skillTypes';
import type { CombatPowerSource } from './skillUsePlan';
import { buildOccupancy, getUnitAtCell } from "./occupancy";
import { resolvePattern } from "./skillPatterns";
import {
  getDamageModifierPercent,
  getVampirismPercent,
} from "./skillDefinitionRuntime";
import type { Rng } from '../shared/random';
import { rollPercent, rollProbability } from '../shared/random';
import { resolveActiveEffectPeriodicHp } from '../shared/activeEffect';

export type CombatEvent =
  | { type: "hit"; unitId: string; unitName: string; damage: number }
  | { type: "dodged"; unitId: string; unitName: string }
  | { type: "blocked"; unitId: string; unitName: string; damage: number }
  | {
      type: "vampirism_heal";
      unitId: string;
      unitName: string;
      amount: number;
    };

export type AttackResult = {
  state: BattleState;
  events: CombatEvent[];
  totalRealDamage: number;
};

export type EffectEvent =
  | {
      type: "effect_applied";
      unitId: string;
      unitName: string;
      effectDisplayName: string;
    }
  | {
      type: "effect_tick_heal";
      unitId: string;
      unitName: string;
      effectDisplayName: string;
      amount: number;
    }
  | {
      type: "effect_tick_damage";
      unitId: string;
      unitName: string;
      effectDisplayName: string;
      amount: number;
    }
  | {
      type: "effect_expired";
      unitId: string;
      unitName: string;
      effectDisplayName: string;
    };

/**
 * Applies damage to all units in hitCells.
 * Large units (occupying multiple cells) are deduplicated — they take
 * the single highest damage value from all cells that hit them.
 * Applies dodge (full miss) and block (50% damage) before applying HP loss.
 * Min hit chance = 10% (dodge capped at 90). Min unblocked chance = 10% (block capped at 90).
 * Active effect defense bonuses (physicalDefenseBonus / magicalDefenseBonus) are applied.
 */
function getDefenseForPowerSource(
  stats: Pick<EffectiveStats, 'physicalDefense' | 'magicalDefense'>,
  powerSource: CombatPowerSource,
): number {
  switch (powerSource) {
    case 'physical_strength':
      return stats.physicalDefense;
    case 'magical_strength':
      return stats.magicalDefense;
    default: {
      const _exhaustive: never = powerSource;
      return _exhaustive;
    }
  }
}

export function getDefenseIgnoreModifierTypeForPowerSource(
  powerSource: CombatPowerSource,
): DamageModifierType {
  switch (powerSource) {
    case 'physical_strength':
      return 'ignore_physical_defense';
    case 'magical_strength':
      return 'ignore_magical_defense';
    default: {
      const _exhaustive: never = powerSource;
      return _exhaustive;
    }
  }
}

export function computePeriodicHpAmount(
  basePower: number,
  multiplier: number,
): number {
  return Math.round(basePower * multiplier);
}

/**
 * Returns the raw damage a single hit would deal to `target` before dodge/block.
 * Used by both resolveAttack (combat) and showSkillPreview (display) to keep formulas in sync.
 */
/** Raw damage vs ALREADY-effective defensive stats, before dodge/block. */
export function computeDamageVsEffectiveStats(
  baseDamage: number,
  powerSource: CombatPowerSource,
  targetStats: Pick<EffectiveStats, 'physicalDefense' | 'magicalDefense'>,
  multiplier: number,
  defIgnorePercent: number,
): number {
  const rawDefense = getDefenseForPowerSource(targetStats, powerSource);
  const defense = rawDefense * (1 - defIgnorePercent / 100);
  const minDamage = Math.round(baseDamage * 0.1);
  const effectiveBase = Math.max(
    minDamage,
    Math.round(baseDamage * (1 - defense / 100)),
  );
  return Math.round(effectiveBase * multiplier);
}

export function computeDamageVsUnit(
  baseDamage: number,
  powerSource: CombatPowerSource,
  target: StatOwner,
  multiplier: number,
  defIgnorePercent: number,
): number {
  return computeDamageVsEffectiveStats(
    baseDamage,
    powerSource,
    effectiveStats(target),
    multiplier,
    defIgnorePercent,
  );
}

export function resolveAttack(
  hitCells: ResolvedHitCell[],
  baseDamage: number,
  powerSource: CombatPowerSource,
  state: BattleState,
  options: {
    damageModifiers?: readonly DamageModifierRef[];
    rng: Rng;
  },
): AttackResult {
  const { damageModifiers, rng } = options;
  // Build a quick lookup: modifier type → ignore percent
  const ignorePercent: Partial<Record<string, number>> = {};
  if (damageModifiers) {
    for (const modifier of damageModifiers) {
      ignorePercent[modifier.type] = getDamageModifierPercent(modifier);
    }
  }

  const hitUnits = new Map<string, { unit: Unit; damage: number }>();

  for (const { coord, multiplier } of hitCells) {
    const unit = getUnitAtCell(state, coord);
    if (!unit) continue;
    if (!isAlive(unit)) continue; // dead targets are inert; no event, no damage

    const defIgnoreKey = getDefenseIgnoreModifierTypeForPowerSource(powerSource);
    const defIgnore = ignorePercent[defIgnoreKey] ?? 0;
    const dmg = computeDamageVsUnit(
      baseDamage,
      powerSource,
      unit,
      multiplier,
      defIgnore,
    );
    const existing = hitUnits.get(unit.id);
    if (!existing || dmg > existing.damage) {
      hitUnits.set(unit.id, { unit, damage: dmg });
    }
  }

  const events: CombatEvent[] = [];
  const newUnits = new Map(state.units);
  let totalRealDamage = 0;

  for (const { unit, damage: rawDmg } of hitUnits.values()) {
    const unitStats = effectiveStats(unit);

    // Apply ignore_dodge
    const dodgeIgnore = ignorePercent["ignore_dodge"] ?? 0;
    const effectiveDodge = Math.min(
      unitStats.dodge * (1 - dodgeIgnore / 100),
      90,
    );

    // Apply ignore_block
    const blockIgnore = ignorePercent["ignore_block"] ?? 0;
    const effectiveBlock = Math.min(
      unitStats.block * (1 - blockIgnore / 100),
      90,
    );

    if (rollPercent(rng, effectiveDodge)) {
      events.push({ type: "dodged", unitId: unit.id, unitName: unit.name });
      continue;
    }

    let finalDmg = rawDmg;
    if (rollPercent(rng, effectiveBlock)) {
      finalDmg = Math.round(rawDmg / 2);
      events.push({
        type: "blocked",
        unitId: unit.id,
        unitName: unit.name,
        damage: finalDmg,
      });
    } else {
      events.push({
        type: "hit",
        unitId: unit.id,
        unitName: unit.name,
        damage: finalDmg,
      });
    }

    // Real damage = capped at current HP (no overkill for vampirism)
    totalRealDamage += Math.min(finalDmg, unit.hp);

    newUnits.set(unit.id, { ...unit, hp: Math.max(0, unit.hp - finalDmg) });
  }

  // Canonicalize any sub-zero-HP unit to dead state, preserving deployment.
  // killUnit is idempotent; canonicalizing unconditionally also scrubs any
  // transitional half-state (e.g. lifeState:'dead' but with stale activeEffects).
  for (const [id, unit] of newUnits) {
    if (unit.hp <= 0) {
      newUnits.set(id, killUnit(unit));
    }
  }

  const occupancy = buildOccupancy(newUnits, state.deployments);

  return {
    state: { ...state, units: newUnits, deployments: state.deployments, occupancy },
    events,
    totalRealDamage,
  };
}

/**
 * Applies vampirism healing after resolveAttack.
 * - self_vampirism: heals only the caster.
 * - mass_vampirism: divides healPool equally among all friendly units with missing HP.
 * Healing never exceeds maxHp.
 */
export function applyVampirism(
  postDamage: PostDamageEffect,
  caster: Unit,
  totalRealDamage: number,
  state: BattleState,
): { state: BattleState; events: CombatEvent[] } {
  const percent = getVampirismPercent(postDamage);
  const healPool = Math.floor((totalRealDamage * percent) / 100);

  if (healPool <= 0) return { state, events: [] };

  const events: CombatEvent[] = [];
  const newUnits = new Map(state.units);

  if (postDamage.type === "self_vampirism") {
    const currentCaster = newUnits.get(caster.id);
    if (currentCaster && isAlive(currentCaster)) {
      const healed = Math.min(healPool, currentCaster.maxHp - currentCaster.hp);
      if (healed > 0) {
        newUnits.set(caster.id, {
          ...currentCaster,
          hp: currentCaster.hp + healed,
        });
        events.push({
          type: "vampirism_heal",
          unitId: caster.id,
          unitName: caster.name,
          amount: healed,
        });
      }
    }
  } else {
    // mass_vampirism: find all friendly alive field units with missing HP
    // (bench units must not receive vampirism heals)
    const friendlySide = caster.side;
    const targets = [...newUnits.values()].filter(
      (u) => u.side === friendlySide && isAlive(u) && u.hp < u.maxHp
           && state.deployments.get(u.id)?.kind === 'field',
    );
    if (targets.length > 0) {
      const healPerUnit = Math.floor(healPool / targets.length);
      if (healPerUnit > 0) {
        for (const target of targets) {
          const healed = Math.min(healPerUnit, target.maxHp - target.hp);
          if (healed > 0) {
            newUnits.set(target.id, { ...target, hp: target.hp + healed });
            events.push({
              type: "vampirism_heal",
              unitId: target.id,
              unitName: target.name,
              amount: healed,
            });
          }
        }
      }
    }
  }

  return {
    state: { ...state, units: newUnits, deployments: state.deployments, occupancy: buildOccupancy(newUnits, state.deployments) },
    events,
  };
}

export type HealEvent = { unitId: string; unitName: string; amount: number };

/**
 * Heals all units in hitCells and returns per-unit heal events.
 * amount in each event = actually applied HP gain (capped to missing HP).
 * Units where applied == 0 are omitted from the events array.
 */
export function resolveHealWithEvents(
  hitCells: ResolvedHitCell[],
  baseHeal: number,
  state: BattleState,
): { state: BattleState; heals: HealEvent[] } {
  const hitUnits = new Map<string, { unit: Unit; heal: number }>();

  for (const { coord, multiplier } of hitCells) {
    const unit = getUnitAtCell(state, coord);
    if (!unit) continue;
    if (!isAlive(unit)) continue; // dead targets: no heal event, no HP change
    const amount = Math.round(baseHeal * multiplier);
    const existing = hitUnits.get(unit.id);
    if (!existing || amount > existing.heal) {
      hitUnits.set(unit.id, { unit, heal: amount });
    }
  }

  const newUnits = new Map(state.units);
  const heals: HealEvent[] = [];
  for (const { unit, heal } of hitUnits.values()) {
    const applied = Math.min(heal, unit.maxHp - unit.hp);
    newUnits.set(unit.id, { ...unit, hp: unit.hp + applied });
    if (applied > 0) {
      heals.push({ unitId: unit.id, unitName: unit.name, amount: applied });
    }
  }

  return {
    state: { ...state, units: newUnits, deployments: state.deployments, occupancy: buildOccupancy(newUnits, state.deployments) },
    heals,
  };
}

export function resolveHeal(
  hitCells: ResolvedHitCell[],
  baseHeal: number,
  state: BattleState,
): BattleState {
  return resolveHealWithEvents(hitCells, baseHeal, state).state;
}

function withAppliedActiveEffect(
  unit: Unit,
  newEffect: ActiveEffect,
): Unit {
  const effects = unit.activeEffects.filter(
    (ae) => ae.effect.id !== newEffect.effect.id,
  );
  if (effects.length >= 2) {
    effects.shift(); // evict oldest (non-duplicate) when at capacity
  }
  effects.push(newEffect);
  return { ...unit, activeEffects: effects };
}

/**
 * Applies a stat effect to all units hit by the resolved pattern.
 * No dodge/block/defense — effects always apply 100%.
 * Each unit may carry at most 2 active effects; the oldest is evicted if full.
 * For periodic HP effects use applyPeriodicHpEffectApplication.
 */
export function applyEffectApplication(
  effectApplication: AppliedEffectMeta,
  resolvedPattern: SkillPattern,
  targetAnchor: CellCoord,
  state: BattleState,
  resolvedEffect: Effect,
): { state: BattleState; events: EffectEvent[] } {
  const hitCells = resolvePattern(targetAnchor, resolvedPattern);
  const events: EffectEvent[] = [];
  const newUnits = new Map(state.units);

  const seen = new Set<string>();
  for (const { coord } of hitCells) {
    const unit = getUnitAtCell(state, coord);
    if (!unit || seen.has(unit.id)) continue;
    if (!isAlive(unit)) continue; // dead targets: no effect_applied event
    seen.add(unit.id);

    const newEffect: ActiveEffect = {
      effectDisplayName: effectApplication.displayName,
      effect: resolvedEffect,
      remainingRounds: effectApplication.duration,
    };

    newUnits.set(unit.id, withAppliedActiveEffect(unit, newEffect));
    events.push({
      type: "effect_applied",
      unitId: unit.id,
      unitName: unit.name,
      effectDisplayName: effectApplication.displayName,
    });
  }

  return {
    state: { ...state, units: newUnits, deployments: state.deployments, occupancy: buildOccupancy(newUnits, state.deployments) },
    events,
  };
}

/**
 * Applies a periodic HP effect to all units hit by the resolved pattern.
 * amountPerTurn is computed per hit cell — each unit receives the amount from
 * the strongest cell that hit it (mirrors resolveAttack deduplication for damage).
 * No dodge/block/defense — effects always apply 100%.
 */
export function applyPeriodicHpEffectApplication(
  effectApplication: AppliedEffectMeta,
  resolvedPattern: SkillPattern,
  targetAnchor: CellCoord,
  state: BattleState,
  resolvedEffect: Effect,
  periodicInput: {
    direction: 'heal' | 'damage';
    basePower: number;
  },
): { state: BattleState; events: EffectEvent[] } {
  const hitCells = resolvePattern(targetAnchor, resolvedPattern);

  // Deduplicate: for large units spanning multiple cells, keep the highest amountPerTurn.
  const hitUnits = new Map<string, { unit: Unit; amountPerTurn: number }>();
  for (const hit of hitCells) {
    const unit = getUnitAtCell(state, hit.coord);
    if (!unit) continue;
    if (!isAlive(unit)) continue; // dead targets: no periodic effect attached
    const amountPerTurn = computePeriodicHpAmount(periodicInput.basePower, hit.multiplier);
    const existing = hitUnits.get(unit.id);
    if (!existing || amountPerTurn > existing.amountPerTurn) {
      hitUnits.set(unit.id, { unit, amountPerTurn });
    }
  }

  const events: EffectEvent[] = [];
  const newUnits = new Map(state.units);

  for (const { unit, amountPerTurn } of hitUnits.values()) {
    const newEffect: ActiveEffect = {
      effectDisplayName: effectApplication.displayName,
      effect: resolvedEffect,
      remainingRounds: effectApplication.duration,
      periodicHp: {
        direction: periodicInput.direction,
        amountPerTurn,
      },
    };

    newUnits.set(unit.id, withAppliedActiveEffect(unit, newEffect));
    events.push({
      type: 'effect_applied',
      unitId: unit.id,
      unitName: unit.name,
      effectDisplayName: effectApplication.displayName,
    });
  }

  return {
    state: { ...state, units: newUnits, deployments: state.deployments, occupancy: buildOccupancy(newUnits, state.deployments) },
    events,
  };
}

/**
 * Called once per round end (simultaneously for all units).
 * - Skips units that are not alive at the start of ticking.
 * - Applies healPerTurn / damagePerTurn from each active effect in order.
 * - Decrements remainingRounds; removes expired effects.
 * - If a unit's HP reaches 0 mid-tick, emits the lethal tick event, then
 *   killUnit() canonicalizes it (clears activeEffects), and remaining effects
 *   on that unit are dropped without emitting expiry events.
 * - Dead units remain in state.units with preserved deployment.
 * - Order-independent across units: each unit only mutates itself.
 */
export function tickEffects(state: BattleState): {
  state: BattleState;
  events: EffectEvent[];
} {
  const events: EffectEvent[] = [];
  const newUnits = new Map(state.units);

  for (const unit of state.units.values()) {
    if (!isAlive(unit)) continue;

    let hp = unit.hp;
    const nextEffects: ActiveEffect[] = [];
    let died = false;

    for (const ae of unit.activeEffects) {
      const periodicHp = resolveActiveEffectPeriodicHp(ae);
      if (periodicHp) {
        if (periodicHp.direction === 'heal') {
          hp = Math.min(unit.maxHp, hp + periodicHp.amountPerTurn);
          events.push({
            type: "effect_tick_heal",
            unitId: unit.id,
            unitName: unit.name,
            effectDisplayName: ae.effectDisplayName,
            amount: periodicHp.amountPerTurn,
          });
        } else {
          hp = Math.max(0, hp - periodicHp.amountPerTurn);
          events.push({
            type: "effect_tick_damage",
            unitId: unit.id,
            unitName: unit.name,
            effectDisplayName: ae.effectDisplayName,
            amount: periodicHp.amountPerTurn,
          });
        }
      }

      if (hp === 0) {
        // Lethal periodic damage: canonicalize and stop processing this unit.
        // killUnit clears activeEffects, so remaining ticks/expiries are dropped.
        newUnits.set(unit.id, killUnit({ ...unit, hp: 0 }));
        died = true;
        break;
      }

      const remaining = ae.remainingRounds - 1;
      if (remaining > 0) {
        nextEffects.push({ ...ae, remainingRounds: remaining });
      } else {
        events.push({
          type: "effect_expired",
          unitId: unit.id,
          unitName: unit.name,
          effectDisplayName: ae.effectDisplayName,
        });
      }
    }

    if (!died) {
      newUnits.set(unit.id, { ...unit, hp, activeEffects: nextEffects });
    }
  }

  const occupancy = buildOccupancy(newUnits, state.deployments);

  return { state: { ...state, units: newUnits, deployments: state.deployments, occupancy }, events };
}

export interface EffectiveStats {
  physicalStrength: number;
  magicalStrength: number;
  physicalDefense: number;
  magicalDefense: number;
  dodge: number;
  block: number;
  initiative: number;
}

interface StatOwner {
  physicalStrength: number; magicalStrength: number;
  physicalDefense: number; magicalDefense: number;
  dodge: number; block: number; initiative: number;
  activeEffects: readonly ActiveEffect[];
}

/** Returns the unit's stats with all active effect bonuses applied. Pure, no side-effects. */
export function effectiveStats(unit: StatOwner): EffectiveStats {
  return unit.activeEffects.reduce<EffectiveStats>(
    (acc, ae) => ({
      physicalStrength: acc.physicalStrength + (ae.effect.physicalStrengthBonus ?? 0),
      magicalStrength: acc.magicalStrength + (ae.effect.magicalStrengthBonus ?? 0),
      physicalDefense:
        acc.physicalDefense + (ae.effect.physicalDefenseBonus ?? 0),
      magicalDefense: acc.magicalDefense + (ae.effect.magicalDefenseBonus ?? 0),
      dodge: acc.dodge + (ae.effect.dodgeBonus ?? 0),
      block: acc.block + (ae.effect.blockBonus ?? 0),
      initiative: acc.initiative + (ae.effect.initiativeBonus ?? 0),
    }),
    {
      physicalStrength: unit.physicalStrength,
      magicalStrength: unit.magicalStrength,
      physicalDefense: unit.physicalDefense,
      magicalDefense: unit.magicalDefense,
      dodge: unit.dodge,
      block: unit.block,
      initiative: unit.initiative,
    },
  );
}

/**
 * Returns the eliminated side when it has no living field units, or null.
 * Bench units and dead field units do not keep battle alive.
 *
 * Note: the returned side is the LOSER, not the winner. Naming is preserved
 * for backwards compatibility with existing callers.
 */
export function checkGameOver(state: BattleState): Side | null {
  let playerAlive = false;
  let enemyAlive  = false;
  for (const unit of getLivingFieldUnits(state)) {
    if (unit.side === "player") playerAlive = true;
    if (unit.side === "enemy")  enemyAlive  = true;
  }
  if (!playerAlive) return "player";
  if (!enemyAlive)  return "enemy";
  return null;
}

/**
 * Resolves probability effects (provoke / distract) for all units in the pattern.
 *
 * For each resolved cell with a unit:
 *   - Roll rng against the cell's probability (multiplier field).
 *   - If the roll fails → emit probability_effect_failed event, skip unit.
 *   - If the roll succeeds → emit probability_effect_applied event.
 *   - If the unit is NOT in roundQueue[1..] (already acted or current actor) →
 *     effect lands but produces no forced-turn side effect (unit not added to
 *     provokedUnitIds / distractedUnitIds).
 *   - If the unit IS in roundQueue[1..] → classify as provoked or distracted.
 *
 * Does NOT mutate roundQueue — caller handles queue removal and counter-attacks.
 */
export function resolveProbabilityEffects(
  probabilityEffect: ProbabilityEffectApplication,
  pattern: SkillPattern,
  targetAnchor: CellCoord,
  state: BattleState,
  roundQueue: string[],
  rng: Rng,
): {
  events: ProbabilityEffectEvent[];
  provokedUnitIds: string[];
  distractedUnitIds: string[];
} {
  const hitCells = resolvePattern(targetAnchor, pattern);

  // Deduplicate — one application per unit per cast (same as applyEffectBlock)
  const seen = new Set<string>();
  const uniqueHits: ResolvedHitCell[] = [];
  for (const hit of hitCells) {
    const unit = getUnitAtCell(state, hit.coord);
    if (!unit || seen.has(unit.id)) continue;
    if (!isAlive(unit)) continue; // dead targets: no applied/failed event, no provoked/distracted id
    seen.add(unit.id);
    uniqueHits.push(hit);
  }

  // Units that have NOT yet acted = roundQueue[1..] (index 0 is the caster)
  const remainingSet = new Set(roundQueue.slice(1));

  const events: ProbabilityEffectEvent[] = [];
  const provokedUnitIds: string[] = [];
  const distractedUnitIds: string[] = [];

  for (const { coord, multiplier: probability } of uniqueHits) {
    const unit = getUnitAtCell(state, coord);
    if (!unit) continue;

    // Probability roll — no dodge/block/defense
    if (!rollProbability(rng, probability)) {
      events.push({
        type: "probability_effect_failed",
        unitId: unit.id,
        unitName: unit.name,
        displayName: probabilityEffect.displayName,
      });
      continue;
    }

    // Roll succeeded — the effect lands regardless of turn eligibility.
    events.push({
      type: "probability_effect_applied",
      unitId: unit.id,
      unitName: unit.name,
      displayName: probabilityEffect.displayName,
    });

    // Only produces a forced-turn side effect for units that still have a turn this round.
    if (!remainingSet.has(unit.id)) continue;

    if (probabilityEffect.type === "provoke") {
      provokedUnitIds.push(unit.id);
    } else {
      distractedUnitIds.push(unit.id);
    }
  }

  return { events, provokedUnitIds, distractedUnitIds };
}
