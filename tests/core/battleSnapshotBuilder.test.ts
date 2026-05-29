import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildBattleUnitSnapshots,
  buildFieldBattleUnitSnapshots,
  buildBenchBattleUnitSnapshots,
} from '../../src/core/battleSnapshotBuilder';
import { makeBattleStateFromUnits } from '../battle/helpers/battleState';
import { makeUnit, resetUnitIdCounter } from '../battle/helpers/units';

describe('battleSnapshotBuilder (Stage 4)', () => {
  beforeEach(() => resetUnitIdCounter());

  it('includes both field and bench runtime units', () => {
    const fieldUnit = makeUnit({ id: 'f1', side: 'player' });
    const benchUnit = makeUnit({ id: 'b1', side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [{ unit: fieldUnit, anchor: { side: 'player', row: 0, col: 0 } }],
      bench: [{ unit: benchUnit, slot: 0 }],
      benchSlotCount: 1,
    });
    const ids = buildBattleUnitSnapshots(state).map(s => s.id).sort();
    expect(ids).toEqual(['b1', 'f1']);
  });

  it('field snapshot has cloned anchor, side, level, and field deployment', () => {
    const unit = makeUnit({ id: 'f1', side: 'player', level: 3 });
    const state = makeBattleStateFromUnits({
      field: [{ unit, anchor: { side: 'player', row: 1, col: 2 } }],
    });
    const [f] = buildFieldBattleUnitSnapshots(state);

    expect(f.deployment.kind).toBe('field');
    expect(f.deployment).not.toBe(state.deployments.get('f1'));    // deployment cloned
    if (f.deployment.kind === 'field') {
      expect(f.deployment.anchor).toEqual({ side: 'player', row: 1, col: 2 });
    }
    expect('anchor' in f).toBe(false);                              // top-level anchor removed in Stage 5
    expect(f.side).toBe('player');
    expect(f.level).toBe(3);
    expect(f.spriteKey === null || typeof f.spriteKey === 'string').toBe(true);
  });

  it('bench snapshot has bench deployment, no anchor, and runtime hp/maxHp', () => {
    const unit = makeUnit({ id: 'b1', side: 'player', hp: 3, maxHp: 10 });
    const state = makeBattleStateFromUnits({
      bench: [{ unit, slot: 2 }],
      benchSlotCount: 4,
    });
    const bench = buildBenchBattleUnitSnapshots(state);
    const b = bench[2]!;

    expect(b.deployment).toEqual({ kind: 'bench', slot: 2 });
    expect('anchor' in b).toBe(false);
    expect(b.side).toBe('player');
    expect(b.hp).toBe(3);
    expect(b.maxHp).toBe(10);
    expect(b.level).toBe(1);
  });

  it('buildBenchBattleUnitSnapshots is positional and derived from deployments', () => {
    const unit = makeUnit({ id: 'b1', side: 'player' });
    const state = makeBattleStateFromUnits({
      bench: [{ unit, slot: 2 }],
      benchSlotCount: 4,
    });

    const bench = buildBenchBattleUnitSnapshots(state);
    expect(bench).toHaveLength(4);
    expect(bench[0]).toBeNull();
    expect(bench[1]).toBeNull();
    expect(bench[2]?.id).toBe('b1');
    expect(bench[3]).toBeNull();
  });
});
