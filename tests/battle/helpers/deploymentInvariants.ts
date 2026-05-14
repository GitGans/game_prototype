import { expect } from 'vitest';
import type { BattleState } from '../../../src/battle/types';

// Checks both directions of the units ↔ deployments invariant.
export function assertDeploymentInvariants(state: BattleState): void {
  // Direction 1: every unit has a deployment.
  for (const unitId of state.units.keys()) {
    const d = state.deployments.get(unitId);
    expect(d).toBeDefined();
    if (!d) continue;

    if (d.kind === 'field') {
      expect(['player', 'enemy']).toContain(d.anchor.side);
      expect([0, 1]).toContain(d.anchor.row);
      expect([0, 1, 2]).toContain(d.anchor.col);
    }

    if (d.kind === 'bench') {
      expect(d.slot).toBeGreaterThanOrEqual(0);
      expect(d.slot).toBeLessThan(state.benchSlotCount);
    }
  }

  // Direction 2: every deployment references an existing unit.
  for (const unitId of state.deployments.keys()) {
    expect(state.units.has(unitId)).toBe(true);
  }

  // No duplicate bench slots.
  const benchSlots = Array.from(state.deployments.values())
    .filter((d): d is { kind: 'bench'; slot: number } => d.kind === 'bench')
    .map(d => d.slot);
  expect(new Set(benchSlots).size).toBe(benchSlots.length);
}
