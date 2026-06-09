import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildBattleUnitSnapshot,
  buildBattleUnitSnapshots,
  buildFieldBattleUnitSnapshots,
  buildBenchBattleUnitSnapshots,
  buildBattleOccupancySnapshot,
  buildBattleFieldUnitCellsSnapshot,
} from '../../src/core/battleSnapshotBuilder';
import { makeBattleStateFromUnits } from '../battle/helpers/battleState';
import { makeUnit, resetUnitIdCounter } from '../battle/helpers/units';
import { cellKey } from '../../src/battle/field';
import { placeBenchUnitOnField } from '../../src/battle/placementState';

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
    expect(f.statDisplay.level).toBe(3);
    expect(f.sprite === null || typeof f.sprite.textureKey === 'string').toBe(true);
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
    expect(b.currentHp).toBe(3);
    expect(b.maxHp).toBe(10);
    expect(b.statDisplay.level).toBe(1);
  });

  it('buildBattleUnitSnapshot copies lifeState from the unit', () => {
    const alive = makeUnit({ id: 'a1', lifeState: 'alive', hp: 5, maxHp: 5 });
    const dead  = makeUnit({ id: 'd1', lifeState: 'dead',  hp: 0, maxHp: 5 });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: alive, anchor: { side: 'player', row: 0, col: 0 } },
        { unit: dead,  anchor: { side: 'player', row: 0, col: 1 } },
      ],
    });
    const snaps = buildBattleUnitSnapshots(state);
    expect(snaps.find(s => s.id === 'a1')?.lifeState).toBe('alive');
    expect(snaps.find(s => s.id === 'd1')?.lifeState).toBe('dead');
  });

  it('buildFieldBattleUnitSnapshots includes dead player and dead enemy field units', () => {
    const p1 = makeUnit({ id: 'p1', side: 'player', lifeState: 'dead',  hp: 0 });
    const p2 = makeUnit({ id: 'p2', side: 'player', lifeState: 'alive' });
    const e1 = makeUnit({ id: 'e1', side: 'enemy',  lifeState: 'dead',  hp: 0 });
    const e2 = makeUnit({ id: 'e2', side: 'enemy',  lifeState: 'alive' });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: p1, anchor: { side: 'player', row: 0, col: 0 } },
        { unit: p2, anchor: { side: 'player', row: 0, col: 1 } },
        { unit: e1, anchor: { side: 'enemy',  row: 0, col: 0 } },
        { unit: e2, anchor: { side: 'enemy',  row: 0, col: 1 } },
      ],
    });
    const ids = buildFieldBattleUnitSnapshots(state).map(s => s.id).sort();
    expect(ids).toEqual(['e1', 'e2', 'p1', 'p2']);
  });

  it('buildBattleOccupancySnapshot excludes dead units (delegates to runtime occupancy)', () => {
    const p1 = makeUnit({ id: 'p1', side: 'player', lifeState: 'dead', hp: 0 });
    const p2 = makeUnit({ id: 'p2', side: 'player', lifeState: 'alive' });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: p1, anchor: { side: 'player', row: 0, col: 0 } },
        { unit: p2, anchor: { side: 'player', row: 0, col: 1 } },
      ],
    });
    const occ = buildBattleOccupancySnapshot(state);
    expect(occ.unitToCells.has('p1')).toBe(false);
    expect(occ.unitToCells.has('p2')).toBe(true);
  });

  it('buildBattleFieldUnitCellsSnapshot includes alive and dead field cells, both sides', () => {
    const p1 = makeUnit({ id: 'p1', side: 'player', lifeState: 'dead', hp: 0 });
    const p2 = makeUnit({ id: 'p2', side: 'player', lifeState: 'alive' });
    const e1 = makeUnit({ id: 'e1', side: 'enemy',  lifeState: 'dead', hp: 0 });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: p1, anchor: { side: 'player', row: 0, col: 0 } },
        { unit: p2, anchor: { side: 'player', row: 0, col: 1 } },
        { unit: e1, anchor: { side: 'enemy',  row: 0, col: 0 } },
      ],
    });
    const cells = buildBattleFieldUnitCellsSnapshot(state);
    expect(cells.unitToCells.has('p1')).toBe(true);
    expect(cells.unitToCells.has('p2')).toBe(true);
    expect(cells.unitToCells.has('e1')).toBe(true);

    // Cell keys must match occupancy encoding (include side).
    expect(cells.cellToUnitIds.get(cellKey({ side: 'player', row: 0, col: 0 }))).toEqual(['p1']);
    expect(cells.cellToUnitIds.get(cellKey({ side: 'enemy',  row: 0, col: 0 }))).toEqual(['e1']);
  });

  it('buildBattleFieldUnitCellsSnapshot orders living before dead within a cell array', () => {
    // Two units overlapping on the same cell: living first, then dead.
    // Use a shape that overlaps deliberately by placing both on the same anchor
    // — only possible because dead units do not block occupancy.
    const alive = makeUnit({ id: 'alive', side: 'player', lifeState: 'alive' });
    const dead  = makeUnit({ id: 'dead',  side: 'player', lifeState: 'dead', hp: 0 });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: dead,  anchor: { side: 'player', row: 0, col: 0 } },  // dead first in insertion
        { unit: alive, anchor: { side: 'player', row: 0, col: 0 } },
      ],
    });
    const cells = buildBattleFieldUnitCellsSnapshot(state);
    const key = cellKey({ side: 'player', row: 0, col: 0 });
    expect(cells.cellToUnitIds.get(key)).toEqual(['alive', 'dead']);
  });

  it('buildBenchBattleUnitSnapshots copies lifeState for a dead bench unit', () => {
    const deadOnBench = makeUnit({ id: 'b1', side: 'player', lifeState: 'dead', hp: 0 });
    const state = makeBattleStateFromUnits({
      bench: [{ unit: deadOnBench, slot: 0 }],
      benchSlotCount: 1,
    });
    const bench = buildBenchBattleUnitSnapshots(state);
    expect(bench[0]?.lifeState).toBe('dead');
    expect(bench[0]?.currentHp).toBe(0);
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

  it('buildBattleUnitSnapshots reflects runtime fields after a bench unit is moved to field', () => {
    const u = makeUnit({
      id:               'b1',
      side:             'player',
      hp:               42,
      maxHp:            80,
      activeSkillIndex: 2,
    });
    const state = makeBattleStateFromUnits({
      bench: [{ unit: u, slot: 0 }],
      benchSlotCount: 1,
    });
    const anchor = { side: 'player' as const, row: 0 as const, col: 0 as const };
    const moved  = placeBenchUnitOnField(state, u, anchor, 0);

    const snap = buildBattleUnitSnapshots(moved).find(s => s.id === 'b1');

    expect(snap).toBeDefined();
    expect(snap!.currentHp).toBe(42);
    expect(snap!.maxHp).toBe(80);
    expect(snap!.activeSkillIndex).toBe(2);
    expect(snap!.deployment.kind).toBe('field');
    if (snap!.deployment.kind === 'field') {
      expect(snap!.deployment.anchor).toEqual(anchor);
    }
  });
});
