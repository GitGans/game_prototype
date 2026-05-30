import { expect } from 'vitest';
import type { BattleState, Unit } from '../../../src/battle/types';

/**
 * Asserts the canonical post-death shape for a unit. Any production kill path
 * must produce all of these properties simultaneously:
 *   - lifeState === 'dead'
 *   - hp === 0
 *   - activeEffects is empty
 *   - the entity is still in state.units (death is state, not deletion)
 *   - the deployment is preserved
 */
export function expectCanonicallyDead(state: BattleState, unitId: string): Unit {
  const unit = state.units.get(unitId);
  expect(unit, `unit ${unitId} missing from state.units`).toBeDefined();
  expect(unit!.lifeState).toBe('dead');
  expect(unit!.hp).toBe(0);
  expect(unit!.activeEffects).toEqual([]);
  expect(state.units.has(unitId)).toBe(true);
  expect(state.deployments.has(unitId)).toBe(true);
  return unit!;
}

/**
 * Walks state.units and asserts the global structural invariant:
 *   hp === 0 ⇔ lifeState === 'dead'
 *
 * Catches half-dead production output that the per-path tests can miss while
 * `isDead` still defensively tolerates `hp <= 0`.
 */
export function expectNoHalfDeadUnits(state: BattleState): void {
  for (const u of state.units.values()) {
    if (u.hp === 0) {
      expect(u.lifeState, `unit ${u.id}: hp===0 but lifeState!=='dead'`).toBe('dead');
    }
    if (u.lifeState === 'dead') {
      expect(u.hp, `unit ${u.id}: lifeState==='dead' but hp!==0`).toBe(0);
      expect(u.activeEffects, `unit ${u.id}: dead unit retains activeEffects`).toEqual([]);
    }
  }
}
