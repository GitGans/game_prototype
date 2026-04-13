import { ActiveEffect, BattleState, CellCoord, DamageType, Effect, ResolvedHitCell, Side, SkillEffectBlock, SkillPattern, Unit } from './types';
import { cellKey } from './field';
import { buildOccupancy, removeUnit } from './occupancy';
import { resolvePattern } from './skillPatterns';

export type CombatEvent =
  | { type: 'hit';     unitId: string; unitName: string; damage: number }
  | { type: 'dodged';  unitId: string; unitName: string }
  | { type: 'blocked'; unitId: string; unitName: string; damage: number };

export type AttackResult = { state: BattleState; events: CombatEvent[] };

export type EffectEvent =
  | { type: 'effect_applied';     unitId: string; unitName: string; effectDisplayName: string }
  | { type: 'effect_tick_heal';   unitId: string; unitName: string; effectDisplayName: string; amount: number }
  | { type: 'effect_tick_damage'; unitId: string; unitName: string; effectDisplayName: string; amount: number }
  | { type: 'effect_expired';     unitId: string; unitName: string; effectDisplayName: string };

/**
 * Applies damage to all units in hitCells.
 * Large units (occupying multiple cells) are deduplicated — they take
 * the single highest damage value from all cells that hit them.
 * Applies dodge (full miss) and block (50% damage) before applying HP loss.
 * Min hit chance = 10% (dodge capped at 90). Min unblocked chance = 10% (block capped at 90).
 * Active effect defense bonuses (physicalDefenseBonus / magicalDefenseBonus) are applied.
 */
export function resolveAttack(
  hitCells: ResolvedHitCell[],
  baseDamage: number,
  damageType: DamageType,
  state: BattleState,
): AttackResult {
  const hitUnits = new Map<string, { unit: Unit; damage: number }>();

  for (const { coord, multiplier } of hitCells) {
    const unit = state.occupancy.cellToUnit.get(cellKey(coord));
    if (!unit) continue;
    const stats = effectiveStats(unit);
    const defense = damageType === 'physical' ? stats.physicalDefense : stats.magicalDefense;
    // min base damage = 10 (before pattern multiplier)
    const effectiveBase = Math.max(10, Math.round(baseDamage * (1 - defense / 100)));
    const dmg = Math.round(effectiveBase * multiplier);
    const existing = hitUnits.get(unit.id);
    if (!existing || dmg > existing.damage) {
      hitUnits.set(unit.id, { unit, damage: dmg });
    }
  }

  const events: CombatEvent[] = [];
  const newUnits = new Map(state.units);

  for (const { unit, damage: rawDmg } of hitUnits.values()) {
    const unitStats = effectiveStats(unit);
    const effectiveDodge = Math.min(unitStats.dodge, 90);
    const effectiveBlock = Math.min(unitStats.block, 90);

    if (Math.random() * 100 < effectiveDodge) {
      events.push({ type: 'dodged', unitId: unit.id, unitName: unit.name });
      continue;
    }

    let finalDmg = rawDmg;
    if (Math.random() * 100 < effectiveBlock) {
      finalDmg = Math.round(rawDmg / 2);
      events.push({ type: 'blocked', unitId: unit.id, unitName: unit.name, damage: finalDmg });
    } else {
      events.push({ type: 'hit', unitId: unit.id, unitName: unit.name, damage: finalDmg });
    }

    newUnits.set(unit.id, { ...unit, hp: Math.max(0, unit.hp - finalDmg) });
  }

  let occupancy = buildOccupancy(newUnits);
  for (const unit of newUnits.values()) {
    if (unit.hp <= 0) {
      newUnits.delete(unit.id);
      occupancy = removeUnit(unit.id, occupancy);
    }
  }

  return { state: { ...state, units: newUnits, occupancy }, events };
}

/**
 * Heals all units in hitCells.
 * Large units deduplicated — they receive the single highest heal value.
 */
export function resolveHeal(
  hitCells: ResolvedHitCell[],
  baseHeal: number,
  state: BattleState,
): BattleState {
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
  for (const { unit, heal } of hitUnits.values()) {
    newUnits.set(unit.id, { ...unit, hp: Math.min(unit.maxHp, unit.hp + heal) });
  }

  return { ...state, units: newUnits, occupancy: buildOccupancy(newUnits) };
}

/**
 * Applies a SkillEffectBlock to all units hit by its pattern.
 * No dodge/block/defense — effects always apply 100%.
 * Each unit may carry at most 2 active effects; the oldest is evicted if full.
 *
 * resolvedEffect and computedPerTurn are resolved by the caller from LEVELED_EFFECTS
 * using the skill's current level, so this function stays data-layer independent.
 */
export function applyEffectBlock(
  block: SkillEffectBlock,
  resolvedPattern: SkillPattern,
  targetAnchor: CellCoord,
  state: BattleState,
  resolvedEffect: Effect,
  computedPerTurn: number | undefined,
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
      effectDisplayName: block.effectDisplayName,
      effect: resolvedEffect,
      remainingRounds: block.duration,
      computedPerTurn,
    };

    const effects = unit.activeEffects.filter(ae => ae.effect.id !== resolvedEffect.id);
    if (effects.length >= 2) {
      effects.shift(); // evict oldest (non-duplicate)
    }
    effects.push(newEffect);

    newUnits.set(unit.id, { ...unit, activeEffects: effects });
    events.push({ type: 'effect_applied', unitId: unit.id, unitName: unit.name, effectDisplayName: block.effectDisplayName });
  }

  return { state: { ...state, units: newUnits, occupancy: buildOccupancy(newUnits) }, events };
}

/**
 * Called once per round end (simultaneously for all units).
 * - Applies healPerTurn / damagePerTurn from each active effect.
 * - Decrements remainingRounds; removes expired effects.
 * - Units that die from damagePerTurn are removed from state.
 */
export function tickEffects(state: BattleState): { state: BattleState; events: EffectEvent[] } {
  const events: EffectEvent[] = [];
  const newUnits = new Map(state.units);

  for (const unit of state.units.values()) {
    let hp = unit.hp;
    const nextEffects: ActiveEffect[] = [];

    for (const ae of unit.activeEffects) {
      if (ae.computedPerTurn !== undefined) {
        if (ae.effect.isBuff) {
          hp = Math.min(unit.maxHp, hp + ae.computedPerTurn);
          events.push({ type: 'effect_tick_heal', unitId: unit.id, unitName: unit.name, effectDisplayName: ae.effectDisplayName, amount: ae.computedPerTurn });
        } else {
          hp = Math.max(0, hp - ae.computedPerTurn);
          events.push({ type: 'effect_tick_damage', unitId: unit.id, unitName: unit.name, effectDisplayName: ae.effectDisplayName, amount: ae.computedPerTurn });
        }
      }

      const remaining = ae.remainingRounds - 1;
      if (remaining > 0) {
        nextEffects.push({ ...ae, remainingRounds: remaining });
      } else {
        events.push({ type: 'effect_expired', unitId: unit.id, unitName: unit.name, effectDisplayName: ae.effectDisplayName });
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
  physicalDamage: number;
  magicalDamage: number;
  physicalDefense: number;
  magicalDefense: number;
  dodge: number;
  block: number;
  initiative: number;
}

/** Returns the unit's stats with all active effect bonuses applied. Pure, no side-effects. */
export function effectiveStats(unit: Unit): EffectiveStats {
  return unit.activeEffects.reduce<EffectiveStats>(
    (acc, ae) => ({
      physicalDamage:  acc.physicalDamage  + (ae.effect.physicalDamageBonus  ?? 0),
      magicalDamage:   acc.magicalDamage   + (ae.effect.magicalDamageBonus   ?? 0),
      physicalDefense: acc.physicalDefense + (ae.effect.physicalDefenseBonus ?? 0),
      magicalDefense:  acc.magicalDefense  + (ae.effect.magicalDefenseBonus  ?? 0),
      dodge:           acc.dodge           + (ae.effect.dodgeBonus            ?? 0),
      block:           acc.block           + (ae.effect.blockBonus            ?? 0),
      initiative:      acc.initiative      + (ae.effect.initiativeBonus       ?? 0),
    }),
    {
      physicalDamage:  unit.physicalDamage,
      magicalDamage:   unit.magicalDamage,
      physicalDefense: unit.physicalDefense,
      magicalDefense:  unit.magicalDefense,
      dodge:           unit.dodge,
      block:           unit.block,
      initiative:      unit.initiative,
    },
  );
}

/** Returns the winning side when all units on one side are dead, or null. */
export function checkGameOver(state: BattleState): Side | null {
  let playerAlive = false;
  let enemyAlive = false;
  for (const unit of state.units.values()) {
    if (unit.anchor.side === 'player') playerAlive = true;
    if (unit.anchor.side === 'enemy') enemyAlive = true;
  }
  if (!playerAlive) return 'player';
  if (!enemyAlive) return 'enemy';
  return null;
}
