/**
 * Stage 3 tests: Placement runtime selection by unit id (not bench index).
 *
 * Verifies that:
 * - selectBenchSlot resolves through state.deployments.
 * - selectBenchSlot stores selectedBenchUnitId, not a slot index.
 * - selectBenchSlot does nothing when the slot is empty.
 * - Bench → field operations preserve the same runtime Unit id.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { selectBenchSlot, placeBenchUnitOnField } from '../../src/battle/placementState';
import { addBenchUnit }                            from '../../src/battle/placement';
import { isFieldUnit }                             from '../../src/battle/deployment';
import { makeBattleStateFromUnits }                from './helpers/battleState';
import { makeUnit, resetUnitIdCounter }            from './helpers/units';
import { coord }                                   from './helpers/coords';
import type { BattleState }                        from '../../src/battle/types';

beforeEach(() => resetUnitIdCounter());

function emptyState(benchSlotCount = 3): BattleState {
  return { ...makeBattleStateFromUnits({}), benchSlotCount };
}

describe('Stage 3 — selectBenchSlot uses deployments as truth', () => {
  it('selects via deployments', () => {
    const unit = makeUnit({ side: 'player' });
    let state  = emptyState(3);
    state = addBenchUnit(state, unit, 1);

    const next = selectBenchSlot(state, 1);

    expect(next.placementSelection.selectedBenchUnitId).toBe(unit.id);
    expect(next.placementSelection.selectedFieldUnitId).toBeNull();
  });

  it('selecting an empty slot is a no-op (preserves prior selection)', () => {
    const state = emptyState(3);

    const next = selectBenchSlot(state, 0);

    expect(next).toBe(state);
  });

  it('returns unchanged state when benchIdx is out of range', () => {
    const state = emptyState(3);
    expect(selectBenchSlot(state, -1)).toBe(state);
    expect(selectBenchSlot(state,  3)).toBe(state);
  });
});

describe('Stage 3 — bench → field preserves unit identity', () => {
  it('placeBenchUnitOnField keeps the same unit id and flips deployment kind', () => {
    const unit = makeUnit({ side: 'player' });
    let state  = emptyState(3);
    state = addBenchUnit(state, unit, 0);

    const next = placeBenchUnitOnField(state, unit, coord('player', 0, 0), 0);

    expect(next.units.has(unit.id)).toBe(true);
    expect(isFieldUnit(next, unit.id)).toBe(true);
    expect(next.placementSelection.selectedBenchUnitId).toBeNull();
  });
});
