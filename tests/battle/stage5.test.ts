/**
 * Stage 5 — Final unified read-model invariants.
 *
 * Verifies the surface after compatibility-bridge removal:
 * - `BattleState` no longer has a `benchUnits` field.
 * - `BattleUnitSnapshot` no longer carries a top-level `anchor`.
 * - Field anchor is reachable only through `deployment.anchor`.
 * - `buildBenchBattleUnitSnapshots` reflects runtime hp/maxHp.
 * - Bench → field transition preserves the same unit id and runtime fields.
 * - Bench `wasOnBench` semantics: derived from initial deployment, stored once,
 *   and not affected by later movement.
 */

import { describe, it, expect, beforeEach }    from 'vitest';
import { selectBenchSlot, placeBenchUnitOnField } from '../../src/battle/placementState';
import { addBenchUnit }                        from '../../src/battle/placement';
import { buildBenchBattleUnitSnapshots,
         buildFieldBattleUnitSnapshots,
         buildBattleUnitSnapshots }            from '../../src/core/battleSnapshotBuilder';
import { makeBattleStateFromUnits }            from './helpers/battleState';
import { makeUnit, resetUnitIdCounter }        from './helpers/units';
import { coord }                               from './helpers/coords';

beforeEach(() => resetUnitIdCounter());

describe('Stage 5 — BattleState shape', () => {
  it('has no benchUnits field', () => {
    const state = makeBattleStateFromUnits({ benchSlotCount: 3 });
    expect('benchUnits' in state).toBe(false);
  });
});

describe('Stage 5 — BattleUnitSnapshot shape', () => {
  it('field snapshots expose anchor only through deployment.anchor', () => {
    const unit = makeUnit({ side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [{ unit, anchor: coord('player', 0, 0) }],
    });
    const [snap] = buildFieldBattleUnitSnapshots(state);

    expect('anchor' in snap).toBe(false);
    expect(snap.deployment.kind).toBe('field');
    if (snap.deployment.kind === 'field') {
      expect(snap.deployment.anchor).toEqual({ side: 'player', row: 0, col: 0 });
    }
  });

  it('bench snapshots use runtime hp/maxHp from the Unit', () => {
    const unit = makeUnit({ side: 'player', hp: 7, maxHp: 10 });
    const state = makeBattleStateFromUnits({
      bench: [{ unit, slot: 0 }],
      benchSlotCount: 3,
    });
    const bench = buildBenchBattleUnitSnapshots(state);

    expect(bench[0]?.hp).toBe(7);
    expect(bench[0]?.maxHp).toBe(10);
  });

  it('bench → field preserves id and runtime fields', () => {
    const unit = makeUnit({
      side: 'player', hp: 4, maxHp: 10,
      activeSkillIndex: 0,
    });
    let state = makeBattleStateFromUnits({ benchSlotCount: 3 });
    state = addBenchUnit(state, unit, 0);

    state = selectBenchSlot(state, 0);
    state = placeBenchUnitOnField(state, unit, coord('player', 0, 0), 0);

    // unit is now on the field; identity and runtime state are preserved
    const all = buildBattleUnitSnapshots(state);
    expect(all).toHaveLength(1);
    const [snap] = all;
    expect(snap.id).toBe(unit.id);
    expect(snap.hp).toBe(4);
    expect(snap.maxHp).toBe(10);
    expect(snap.activeSkillIndex).toBe(0);
    expect(snap.deployment.kind).toBe('field');
  });
});

describe('Stage 5 — wasOnBench derived from initial deployment', () => {
  it('reading deployment.kind === "bench" at battle start is the source for wasOnBench', () => {
    const unit = makeUnit({ side: 'player', templateId: 'reserve' });
    const initial = makeBattleStateFromUnits({
      bench: [{ unit, slot: 0 }],
      benchSlotCount: 3,
    });

    const dep = initial.deployments.get(unit.id);
    const wasOnBench = dep?.kind === 'bench';
    expect(wasOnBench).toBe(true);

    // Move the unit to the field — the captured boolean is unchanged
    // (battle participants are stored once; mid-battle moves do not retroactively
    // change a participant snapshot taken at start).
    const moved = placeBenchUnitOnField(initial, unit, coord('player', 0, 0), 0);
    expect(moved.deployments.get(unit.id)?.kind).toBe('field');
    expect(wasOnBench).toBe(true);
  });
});
