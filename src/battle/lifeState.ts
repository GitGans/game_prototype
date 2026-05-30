import type { Unit } from './types';

// Structural input for predicates. Anything carrying current hp and the
// canonical life-state tag can be classified — full Unit not required.
// Used by deadFriendlyTargeting.ts so callers can pass structural snapshots.
export type LifeStateReadable = Pick<Unit, 'hp' | 'lifeState'>;

// These predicates intentionally depend only on hp/lifeState.
// They are not strict complements during the migration off implicit hp<=0 death:
// isDead() keeps a defensive `hp <= 0` branch for legacy snapshots that haven't
// had killUnit applied yet. Prefer isAlive() for "can act / counts as living".
export function isAlive(unit: LifeStateReadable): boolean {
  return unit.lifeState === 'alive' && unit.hp > 0;
}

export function isDead(unit: LifeStateReadable): boolean {
  return unit.lifeState === 'dead' || unit.hp <= 0;
}

// Death rule: clears activeEffects. Buffs/debuffs/periodic-HP effects do not
// survive death; revive does not restore them. See src/battle/CLAUDE.md.
export function killUnit(unit: Unit): Unit {
  return {
    ...unit,
    lifeState: 'dead',
    hp: 0,
    activeEffects: [],
  };
}

// Primitive only. Callers compute revive amount (flat / %max / caster-scaled) elsewhere.
// Clamps hp into [1, maxHp]. Does NOT touch roundQueue or any BattleState-level structure.
export function reviveUnit(unit: Unit, hp: number): Unit {
  return {
    ...unit,
    lifeState: 'alive',
    hp: Math.max(1, Math.min(unit.maxHp, hp)),
  };
}
