import { BattleState, DamageType, ResolvedHitCell, Side, Unit } from './types';
import { cellKey } from './field';
import { buildOccupancy, removeUnit } from './occupancy';

export type CombatEvent =
  | { type: 'hit';     unitId: string; unitName: string; damage: number }
  | { type: 'dodged';  unitId: string; unitName: string }
  | { type: 'blocked'; unitId: string; unitName: string; damage: number };

export type AttackResult = { state: BattleState; events: CombatEvent[] };

/**
 * Applies damage to all units in hitCells.
 * Large units (occupying multiple cells) are deduplicated — they take
 * the single highest damage value from all cells that hit them.
 * Applies dodge (full miss) and block (50% damage) before applying HP loss.
 * Min hit chance = 10% (dodge capped at 90). Min unblocked chance = 10% (block capped at 90).
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
    const defense = damageType === 'physical' ? unit.physicalDefense : unit.magicalDefense;
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
