import { ActiveEffect, BattleState, CellCoord, DamageType, ResolvedHitCell, Side, SkillEffectBlock, Unit } from './types';
import { cellKey } from './field';
import { buildOccupancy, removeUnit } from './occupancy';
import { resolvePattern } from './skillPatterns';

export type CombatEvent =
  | { type: 'hit';     unitId: string; unitName: string; damage: number }
  | { type: 'dodged';  unitId: string; unitName: string }
  | { type: 'blocked'; unitId: string; unitName: string; damage: number };

export type AttackResult = { state: BattleState; events: CombatEvent[] };

export type EffectEvent =
  | { type: 'effect_applied';     unitId: string; unitName: string; effectName: string }
  | { type: 'effect_tick_heal';   unitId: string; unitName: string; effectName: string; amount: number }
  | { type: 'effect_tick_damage'; unitId: string; unitName: string; effectName: string; amount: number }
  | { type: 'effect_expired';     unitId: string; unitName: string; effectName: string };

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
    const baseDefense = damageType === 'physical' ? unit.physicalDefense : unit.magicalDefense;
    const bonusDefense = unit.activeEffects.reduce((sum, ae) => {
      return sum + (damageType === 'physical'
        ? (ae.effect.physicalDefenseBonus ?? 0)
        : (ae.effect.magicalDefenseBonus ?? 0));
    }, 0);
    const defense = baseDefense + bonusDefense;
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
    const effectiveDodge = Math.min(unit.dodge, 90);
    const effectiveBlock = Math.min(unit.block, 90);

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
 */
export function applyEffectBlock(
  block: SkillEffectBlock,
  targetAnchor: CellCoord,
  state: BattleState,
): { state: BattleState; events: EffectEvent[] } {
  const hitCells = resolvePattern(targetAnchor, block.pattern);
  const events: EffectEvent[] = [];
  const newUnits = new Map(state.units);

  const seen = new Set<string>();
  for (const { coord } of hitCells) {
    const unit = state.occupancy.cellToUnit.get(cellKey(coord));
    if (!unit || seen.has(unit.id)) continue;
    seen.add(unit.id);

    const newEffect: ActiveEffect = {
      effectName: block.effectName,
      effect: block.effect,
      remainingRounds: block.duration,
    };

    const effects = [...unit.activeEffects];
    if (effects.length >= 2) {
      effects.shift(); // evict oldest
    }
    effects.push(newEffect);

    newUnits.set(unit.id, { ...unit, activeEffects: effects });
    events.push({ type: 'effect_applied', unitId: unit.id, unitName: unit.name, effectName: block.effectName });
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
      if (ae.effect.healPerTurn) {
        const amount = ae.effect.healPerTurn;
        hp = Math.min(unit.maxHp, hp + amount);
        events.push({ type: 'effect_tick_heal', unitId: unit.id, unitName: unit.name, effectName: ae.effectName, amount });
      }
      if (ae.effect.damagePerTurn) {
        const amount = ae.effect.damagePerTurn;
        hp = Math.max(0, hp - amount);
        events.push({ type: 'effect_tick_damage', unitId: unit.id, unitName: unit.name, effectName: ae.effectName, amount });
      }

      const remaining = ae.remainingRounds - 1;
      if (remaining > 0) {
        nextEffects.push({ ...ae, remainingRounds: remaining });
      } else {
        events.push({ type: 'effect_expired', unitId: unit.id, unitName: unit.name, effectName: ae.effectName });
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
