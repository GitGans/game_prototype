import type { Unit } from './types';

// Use this for "can act / can be targeted / counts as living" checks.
// Do NOT write `!isDead(unit)` — the two helpers are intentionally not strict complements
// during the multi-stage migration off implicit hp<=0 death.
export function isAlive(unit: Unit): boolean {
  return unit.lifeState === 'alive' && unit.hp > 0;
}

// Defensive/transitional: returns true for the canonical dead state AND for legacy
// `hp <= 0` units that haven't had `killUnit` applied yet. Canonical invariant remains
// `lifeState === 'dead' && hp === 0`. New gameplay-eligibility code must use isAlive().
export function isDead(unit: Unit): boolean {
  return unit.lifeState === 'dead' || unit.hp <= 0;
}

// Death rule: clears activeEffects. Buffs/debuffs/periodic-HP effects do not survive death;
// revive does not restore them. See src/battle/CLAUDE.md for the documented invariant.
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
