import { describe, it, expect, beforeEach } from 'vitest';
import {
  selectBenchSlot,
  placeBenchUnitOnField,
  swapBenchWithField,
  moveFieldUnitToBench,
  returnFieldUnitToBench,
} from '../../src/battle/placementState';
import { makeUnit, resetUnitIdCounter } from './helpers/units';
import { makeBattleStateFromUnits }     from './helpers/battleState';
import { coord }                        from './helpers/coords';
import { assertDeploymentInvariants }   from './helpers/deploymentInvariants';

describe('selectBenchSlot', () => {
  beforeEach(() => resetUnitIdCounter());

  it('selects the unit deployed in that slot', () => {
    const u = makeUnit({ id: 'b1' });
    const state = makeBattleStateFromUnits({
      bench: [{ unit: u, slot: 0 }],
      benchSlotCount: 2,
    });
    const next = selectBenchSlot(state, 0);

    expect(next.placementSelection.selectedBenchUnitId).toBe('b1');
    expect(next.placementSelection.selectedFieldUnitId).toBeNull();
  });

  it('returns the same state for an empty slot', () => {
    const state = makeBattleStateFromUnits({ benchSlotCount: 2 });
    expect(selectBenchSlot(state, 0)).toBe(state);
  });

  it('returns the same state for out-of-range slots', () => {
    const u = makeUnit({ id: 'b1' });
    const state = makeBattleStateFromUnits({
      bench: [{ unit: u, slot: 0 }],
      benchSlotCount: 2,
    });
    expect(selectBenchSlot(state, -1)).toBe(state);
    expect(selectBenchSlot(state, 2)).toBe(state);
  });
});

describe('placeBenchUnitOnField', () => {
  beforeEach(() => resetUnitIdCounter());

  it('preserves runtime identity and changes deployment to field', () => {
    const u = makeUnit({ id: 'b1', side: 'player' });
    const state = makeBattleStateFromUnits(
      { bench: [{ unit: u, slot: 1 }], benchSlotCount: 3 },
      { placementSelection: { selectedBenchUnitId: 'b1', selectedFieldUnitId: null } },
    );
    const anchor = coord('player', 0, 0);
    const next   = placeBenchUnitOnField(state, u, anchor, 1);

    expect(next.units.has('b1')).toBe(true);
    expect(next.units.get('b1')?.hp).toBe(u.hp);
    expect(next.units.get('b1')?.maxHp).toBe(u.maxHp);
    expect(next.units.size).toBe(state.units.size);

    const dep = next.deployments.get('b1')!;
    expect(dep.kind).toBe('field');
    if (dep.kind === 'field') expect(dep.anchor).toEqual(anchor);

    expect(next.placementSelection.selectedBenchUnitId).toBeNull();
    assertDeploymentInvariants(next);
  });

  it('returns unchanged state if the unit is not bench-deployed at the requested slot', () => {
    const u = makeUnit({ id: 'b1' });
    const state = makeBattleStateFromUnits({
      bench: [{ unit: u, slot: 0 }],
      benchSlotCount: 2,
    });
    expect(placeBenchUnitOnField(state, u, coord('player', 0, 0), 1)).toBe(state);
  });
});

describe('swapBenchWithField', () => {
  beforeEach(() => resetUnitIdCounter());

  it('swaps deployments without changing runtime identities', () => {
    const bench = makeUnit({ id: 'b1', side: 'player' });
    const field = makeUnit({ id: 'f1', side: 'player' });
    const fieldAnchor = coord('player', 0, 0);
    const state = makeBattleStateFromUnits(
      {
        field: [{ unit: field, anchor: fieldAnchor }],
        bench: [{ unit: bench, slot: 0 }],
        benchSlotCount: 2,
      },
      { placementSelection: { selectedBenchUnitId: 'b1', selectedFieldUnitId: 'f1' } },
    );
    const next = swapBenchWithField(state, bench, 0, field);

    expect(next.units.size).toBe(2);
    expect(next.units.has('b1')).toBe(true);
    expect(next.units.has('f1')).toBe(true);

    const benchDep = next.deployments.get('b1')!;
    const fieldDep = next.deployments.get('f1')!;
    expect(benchDep.kind).toBe('field');
    expect(fieldDep.kind).toBe('bench');
    if (benchDep.kind === 'field') expect(benchDep.anchor).toEqual(fieldAnchor);
    if (fieldDep.kind === 'bench') expect(fieldDep.slot).toBe(0);

    expect(next.placementSelection.selectedBenchUnitId).toBeNull();
    expect(next.placementSelection.selectedFieldUnitId).toBeNull();
    assertDeploymentInvariants(next);
  });
});

describe('moveFieldUnitToBench', () => {
  beforeEach(() => resetUnitIdCounter());

  it('preserves the same runtime unit', () => {
    const u = makeUnit({ id: 'f1', side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [{ unit: u, anchor: coord('player', 0, 0) }],
      benchSlotCount: 2,
    });
    const next = moveFieldUnitToBench(state, 'f1', 0);

    expect(next.units.has('f1')).toBe(true);
    expect(next.units.get('f1')?.hp).toBe(u.hp);
    expect(next.units.size).toBe(1);
    expect(next.deployments.get('f1')!.kind).toBe('bench');
    assertDeploymentInvariants(next);
  });
});

describe('returnFieldUnitToBench', () => {
  beforeEach(() => resetUnitIdCounter());

  it('moves a field unit to a free bench slot', () => {
    const u = makeUnit({ id: 'f1', side: 'player' });
    const occupiedBench = makeUnit({ id: 'b1', side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [{ unit: u, anchor: coord('player', 0, 0) }],
      bench: [{ unit: occupiedBench, slot: 0 }],
      benchSlotCount: 2,
    });
    const next = returnFieldUnitToBench(state, 'f1');

    expect(next.units.has('f1')).toBe(true);
    const dep = next.deployments.get('f1')!;
    expect(dep.kind).toBe('bench');
    if (dep.kind === 'bench') {
      expect(dep.slot).toBeGreaterThanOrEqual(0);
      expect(dep.slot).toBeLessThan(state.benchSlotCount);
      expect(dep.slot).not.toBe(0);
    }
    assertDeploymentInvariants(next);
  });
});
