import { BattleState, DamageType, ResolvedHitCell, Side, Unit } from './types';
import { cellKey } from './field';
import { buildOccupancy, removeUnit } from './occupancy';

/**
 * Applies damage to all units in hitCells.
 * Large units (occupying multiple cells) are deduplicated — they take
 * the single highest damage value from all cells that hit them.
 * damageType is reserved for future armor/resistance logic.
 */
export function resolveAttack(
  hitCells: ResolvedHitCell[],
  baseDamage: number,
  _damageType: DamageType,
  state: BattleState,
): BattleState {
  const hitUnits = new Map<string, { unit: Unit; damage: number }>();

  for (const { coord, multiplier } of hitCells) {
    const unit = state.occupancy.cellToUnit.get(cellKey(coord));
    if (!unit) continue;
    const dmg = Math.round(baseDamage * multiplier);
    const existing = hitUnits.get(unit.id);
    if (!existing || dmg > existing.damage) {
      hitUnits.set(unit.id, { unit, damage: dmg });
    }
  }

  const newUnits = new Map(state.units);
  for (const { unit, damage } of hitUnits.values()) {
    newUnits.set(unit.id, { ...unit, hp: Math.max(0, unit.hp - damage) });
  }

  let occupancy = buildOccupancy(newUnits);
  for (const unit of newUnits.values()) {
    if (unit.hp <= 0) {
      newUnits.delete(unit.id);
      occupancy = removeUnit(unit.id, occupancy);
    }
  }

  return { ...state, units: newUnits, occupancy };
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
