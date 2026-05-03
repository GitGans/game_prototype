import {
  ActiveEffect,
  BattleState,
  CellCoord,
  Effect,
  InstantEffectEvent,
  ResolvedHitCell,
  Side,
  SkillPattern,
  Unit,
} from "./types";
import type {
  AppliedEffectMeta,
  DamageModifierRef,
  DamageModifierType,
  InstantEffectApplication,
  PostDamageEffect,
} from '../shared/skillTypes';
import type { CombatPowerSource } from './skillUsePlan';
import { cellKey } from "./field";
import { buildOccupancy, removeUnit } from "./occupancy";
import { resolvePattern } from "./skillPatterns";
import {
  getDamageModifierPercent,
  getVampirismPercent,
} from "./skillDefinitionRuntime";
import type { Rng } from '../shared/random';
import { rollPercent, rollProbability } from '../shared/random';
import type { PeriodicHp } from '../shared/activeEffect';
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

/**
 * Returns the raw damage a single hit would deal to `target` before dodge/block.
 * Used by both resolveAttack (combat) and showSkillPreview (display) to keep formulas in sync.
 */
export function computeDamageVsUnit(
  baseDamage: number,
  powerSource: CombatPowerSource,
  target: StatOwner,
  multiplier: number,
  defIgnorePercent: number,
): number {
  const stats = effectiveStats(target);
  const rawDefense = getDefenseForPowerSource(stats, powerSource);
  const defense = rawDefense * (1 - defIgnorePercent / 100);
  const minDamage = Math.round(baseDamage * 0.1);
  const effectiveBase = Math.max(
    minDamage,
    Math.round(baseDamage * (1 - defense / 100)),
  );
  return Math.round(effectiveBase * multiplier);
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
    const unit = state.occupancy.cellToUnit.get(cellKey(coord));
    if (!unit) continue;

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

  let occupancy = buildOccupancy(newUnits);
  for (const unit of newUnits.values()) {
    if (unit.hp <= 0) {
      newUnits.delete(unit.id);
      occupancy = removeUnit(unit.id, occupancy);
    }
  }

  return {
    state: { ...state, units: newUnits, occupancy },
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
    if (currentCaster && currentCaster.hp > 0) {
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
    // mass_vampirism: find all friendly alive units with missing HP
    const friendlySide = caster.anchor.side;
    const targets = [...newUnits.values()].filter(
      (u) => u.anchor.side === friendlySide && u.hp > 0 && u.hp < u.maxHp,
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
    state: { ...state, units: newUnits, occupancy: buildOccupancy(newUnits) },
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
    const unit = state.occupancy.cellToUnit.get(cellKey(coord));
    if (!unit) continue;
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
    state: { ...state, units: newUnits, occupancy: buildOccupancy(newUnits) },
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

/**
 * Applies an effect to all units hit by the resolved pattern.
 * No dodge/block/defense — effects always apply 100%.
 * Each unit may carry at most 2 active effects; the oldest is evicted if full.
 *
 * periodicHp, when provided, carries explicit runtime direction and amountPerTurn.
 * Absent for stat-only effects.
 */
export function applyEffectApplication(
  effectApplication: AppliedEffectMeta,
  resolvedPattern: SkillPattern,
  targetAnchor: CellCoord,
  state: BattleState,
  resolvedEffect: Effect,
  periodicHp?: PeriodicHp,
): { state: BattleState; events: EffectEvent[] } {
  const hitCells = resolvePattern(targetAnchor, resolvedPattern);
  const events: EffectEvent[] = [];
  const newUnits = new Map(state.units);

  const seen = new Set<string>();
  for (const { coord } of hitCells) {
    const unit = state.occupancy.cellToUnit.get(cellKey(coord));
    if (!unit || seen.has(unit.id)) continue;
    seen.add(unit.id);

    const newEffect: ActiveEffect = {
      effectDisplayName: effectApplication.displayName,
      effect: resolvedEffect,
      remainingRounds: effectApplication.duration,
      periodicHp,
    };

    const effects = unit.activeEffects.filter(
      (ae) => ae.effect.id !== resolvedEffect.id,
    );
    if (effects.length >= 2) {
      effects.shift(); // evict oldest (non-duplicate)
    }
    effects.push(newEffect);

    newUnits.set(unit.id, { ...unit, activeEffects: effects });
    events.push({
      type: "effect_applied",
      unitId: unit.id,
      unitName: unit.name,
      effectDisplayName: effectApplication.displayName,
    });
  }

  return {
    state: { ...state, units: newUnits, occupancy: buildOccupancy(newUnits) },
    events,
  };
}

/**
 * Called once per round end (simultaneously for all units).
 * - Applies healPerTurn / damagePerTurn from each active effect.
 * - Decrements remainingRounds; removes expired effects.
 * - Units that die from damagePerTurn are removed from state.
 */
export function tickEffects(state: BattleState): {
  state: BattleState;
  events: EffectEvent[];
} {
  const events: EffectEvent[] = [];
  const newUnits = new Map(state.units);

  for (const unit of state.units.values()) {
    let hp = unit.hp;
    const nextEffects: ActiveEffect[] = [];

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

    newUnits.set(unit.id, { ...unit, hp, activeEffects: nextEffects });
  }

  // Remove units that died from effect damage
  let occupancy = buildOccupancy(newUnits);
  for (const unit of newUnits.values()) {
    if (unit.hp <= 0) {
      newUnits.delete(unit.id);
      occupancy = removeUnit(unit.id, occupancy);
    }
  }

  return { state: { ...state, units: newUnits, occupancy }, events };
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

/** Returns the winning side when all units on one side are dead, or null. */
export function checkGameOver(state: BattleState): Side | null {
  let playerAlive = false;
  let enemyAlive = false;
  for (const unit of state.units.values()) {
    if (unit.anchor.side === "player") playerAlive = true;
    if (unit.anchor.side === "enemy") enemyAlive = true;
  }
  if (!playerAlive) return "player";
  if (!enemyAlive) return "enemy";
  return null;
}

/**
 * Resolves instant effects (provoke / distract) for all units in the pattern.
 *
 * For each resolved cell with a unit:
 *   - Roll rng against the cell's probability (multiplier field).
 *   - If the roll fails → emit instant_effect_failed event, skip unit.
 *   - If the roll succeeds → emit instant_effect_applied event.
 *   - If the unit is NOT in roundQueue[1..] (already acted or current actor) →
 *     effect lands but produces no forced-turn side effect (unit not added to
 *     provokedUnitIds / distractedUnitIds).
 *   - If the unit IS in roundQueue[1..] → classify as provoked or distracted.
 *
 * Does NOT mutate roundQueue — caller handles queue removal and counter-attacks.
 */
export function resolveInstantEffects(
  instantEffect: InstantEffectApplication,
  pattern: SkillPattern,
  targetAnchor: CellCoord,
  state: BattleState,
  roundQueue: string[],
  rng: Rng,
): {
  events: InstantEffectEvent[];
  provokedUnitIds: string[];
  distractedUnitIds: string[];
} {
  const hitCells = resolvePattern(targetAnchor, pattern);

  // Deduplicate — one application per unit per cast (same as applyEffectBlock)
  const seen = new Set<string>();
  const uniqueHits: ResolvedHitCell[] = [];
  for (const hit of hitCells) {
    const unit = state.occupancy.cellToUnit.get(cellKey(hit.coord));
    if (!unit || seen.has(unit.id)) continue;
    seen.add(unit.id);
    uniqueHits.push(hit);
  }

  // Units that have NOT yet acted = roundQueue[1..] (index 0 is the caster)
  const remainingSet = new Set(roundQueue.slice(1));

  const events: InstantEffectEvent[] = [];
  const provokedUnitIds: string[] = [];
  const distractedUnitIds: string[] = [];

  for (const { coord, multiplier: probability } of uniqueHits) {
    const unit = state.occupancy.cellToUnit.get(cellKey(coord));
    if (!unit) continue;

    // Probability roll — no dodge/block/defense
    if (!rollProbability(rng, probability)) {
      events.push({
        type: "instant_effect_failed",
        unitId: unit.id,
        unitName: unit.name,
        displayName: instantEffect.displayName,
      });
      continue;
    }

    // Roll succeeded — the effect lands regardless of turn eligibility.
    events.push({
      type: "instant_effect_applied",
      unitId: unit.id,
      unitName: unit.name,
      displayName: instantEffect.displayName,
    });

    // Only produces a forced-turn side effect for units that still have a turn this round.
    if (!remainingSet.has(unit.id)) continue;

    if (instantEffect.type === "provoke") {
      provokedUnitIds.push(unit.id);
    } else {
      distractedUnitIds.push(unit.id);
    }
  }

  return { events, provokedUnitIds, distractedUnitIds };
}
