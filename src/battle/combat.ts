import { BattleState, CellCoord, Side, Unit } from './types';
import { cellKey } from './field';
import { buildOccupancy, removeUnit } from './occupancy';

/**
 * Full attack sequence:
 * 1. Find units in target cells
 * 2. Deduplicate (large units hit only once)
 * 3. Apply damage
 * 4. Remove dead units
 */
export function resolveAttack(
  targetCells: CellCoord[],
  damage: number,
  state: BattleState
): BattleState {
  // Step 1-2: find unique units in target cells
  const hitUnits = new Map<string, Unit>();
  for (const coord of targetCells) {
    const unit = state.occupancy.cellToUnit.get(cellKey(coord));
    if (unit && !hitUnits.has(unit.id)) {
      hitUnits.set(unit.id, unit);
    }
  }

  // Step 3: apply damage
  const newUnits = new Map(state.units);
  for (const unit of hitUnits.values()) {
    const updated: Unit = { ...unit, hp: Math.max(0, unit.hp - damage) };
    newUnits.set(unit.id, updated);
  }

  // Step 4: remove dead units
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
 * Heal sequence: find unique units in target cells, restore HP (capped at maxHp).
 */
export function resolveHeal(
  targetCells: CellCoord[],
  healAmount: number,
  state: BattleState
): BattleState {
  const hitUnits = new Map<string, Unit>();
  for (const coord of targetCells) {
    const unit = state.occupancy.cellToUnit.get(cellKey(coord));
    if (unit && !hitUnits.has(unit.id)) {
      hitUnits.set(unit.id, unit);
    }
  }

  const newUnits = new Map(state.units);
  for (const unit of hitUnits.values()) {
    const updated: Unit = { ...unit, hp: Math.min(unit.maxHp, unit.hp + healAmount) };
    newUnits.set(unit.id, updated);
  }

  const occupancy = buildOccupancy(newUnits);
  return { ...state, units: newUnits, occupancy };
}

/** Returns true when all units on one side are dead. */
export function checkGameOver(state: BattleState): Side | null {
  let playerAlive = false;
  let enemyAlive = false;
  for (const unit of state.units.values()) {
    if (unit.anchor.side === 'player') playerAlive = true;
    if (unit.anchor.side === 'enemy') enemyAlive = true;
  }
  if (!playerAlive) return 'player'; // player lost
  if (!enemyAlive) return 'enemy';  // enemy lost
  return null;
}

