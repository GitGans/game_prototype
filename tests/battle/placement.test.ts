import { describe, it, expect, beforeEach } from 'vitest';
import {
  addFieldUnit,
  addBenchUnit,
  deployExistingUnitToBench,
  canPlace,
  placeUnit,
} from '../../src/battle/placement';
import { swapFieldUnits } from '../../src/battle/placementState';
import { cellKey } from '../../src/battle/field';
import { makeUnit, resetUnitIdCounter } from './helpers/units';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { assertDeploymentInvariants } from './helpers/deploymentInvariants';
import { coord } from './helpers/coords';
import { autoPlacePlayer } from '../../src/battle/autoPlace';
import type { BattleState } from '../../src/battle/types';
import type { PlayerPlacementCandidate } from '../../src/battle/autoPlace';

beforeEach(() => resetUnitIdCounter());

function emptyState(benchSlotCount = 0): BattleState {
  return { ...makeBattleStateFromUnits([]), benchSlotCount };
}

describe('addFieldUnit', () => {
  it('adds the unit to state.units', () => {
    const unit = makeUnit({ anchor: coord('player', 0, 0) });
    const state = addFieldUnit(emptyState(), unit, unit.anchor);
    expect(state.units.has(unit.id)).toBe(true);
  });

  it('creates a field deployment in state.deployments', () => {
    const unit = makeUnit({ anchor: coord('player', 0, 0) });
    const state = addFieldUnit(emptyState(), unit, unit.anchor);
    const d = state.deployments.get(unit.id);
    expect(d?.kind).toBe('field');
    expect(d?.kind === 'field' && d.anchor).toEqual(unit.anchor);
  });

  it('rebuilds occupancy so the unit cells are marked', () => {
    const unit = makeUnit({ anchor: coord('player', 0, 1) });
    const state = addFieldUnit(emptyState(), unit, unit.anchor);
    expect(state.occupancy.cellToUnitId.get(cellKey(coord('player', 0, 1)))).toBe(unit.id);
  });

  it('throws when unit id already exists in state.units', () => {
    const unit = makeUnit({ anchor: coord('player', 0, 0) });
    const state = addFieldUnit(emptyState(), unit, unit.anchor);
    expect(() => addFieldUnit(state, unit, unit.anchor)).toThrow(
      `addFieldUnit: unit "${unit.id}" already exists in state.units`,
    );
  });

  it('throws when a deployment already exists for the unit id', () => {
    const unit = makeUnit({ anchor: coord('player', 0, 0) });
    // Manually inject a deployment without adding to units
    const base = emptyState();
    const stateWithDep = {
      ...base,
      deployments: new Map([[unit.id, { kind: 'field' as const, anchor: unit.anchor }]]),
    };
    expect(() => addFieldUnit(stateWithDep, unit, unit.anchor)).toThrow(
      `addFieldUnit: deployment already exists for unit "${unit.id}"`,
    );
  });
});

describe('addBenchUnit', () => {
  it('adds the unit and bench deployment but no cells in occupancy', () => {
    const unit = makeUnit({ anchor: coord('player', 0, 0) });
    const state = addBenchUnit(emptyState(3), unit, 0);
    expect(state.units.has(unit.id)).toBe(true);
    expect(state.deployments.get(unit.id)?.kind).toBe('bench');
    expect(state.occupancy.cellToUnitId.size).toBe(0);
  });

  it('throws when the slot is out of range', () => {
    const unit = makeUnit();
    expect(() => addBenchUnit(emptyState(2), unit, 2)).toThrow(
      'Bench slot 2 is out of range [0, 2)',
    );
    expect(() => addBenchUnit(emptyState(2), unit, -1)).toThrow(
      'Bench slot -1 is out of range [0, 2)',
    );
  });

  it('throws when the slot is already occupied', () => {
    const u1 = makeUnit();
    const u2 = makeUnit();
    let state = emptyState(3);
    state = addBenchUnit(state, u1, 0);
    expect(() => addBenchUnit(state, u2, 0)).toThrow(
      `Bench slot 0 is already occupied by unit "${u1.id}"`,
    );
  });
});

describe('deployExistingUnitToBench', () => {
  it('throws when slot is out of range', () => {
    const unit = makeUnit({ anchor: coord('player', 0, 0) });
    const state = addFieldUnit(emptyState(2), unit, unit.anchor);
    expect(() => deployExistingUnitToBench(state, unit.id, 5)).toThrow(
      'Bench slot 5 is out of range [0, 2)',
    );
  });

  it('throws when slot is already occupied by another unit', () => {
    const u1 = makeUnit({ anchor: coord('player', 0, 0) });
    const u2 = makeUnit();
    let state = addFieldUnit(emptyState(3), u1, u1.anchor);
    state = addBenchUnit(state, u2, 1);
    expect(() => deployExistingUnitToBench(state, u1.id, 1)).toThrow(
      `Bench slot 1 is already occupied by unit "${u2.id}"`,
    );
  });

  it('does not throw when moving a bench unit to its own slot (no-op re-assign)', () => {
    const unit = makeUnit();
    let state = emptyState(3);
    state = addBenchUnit(state, unit, 2);
    expect(() => deployExistingUnitToBench(state, unit.id, 2)).not.toThrow();
  });
});

describe('placeUnit compatibility wrapper', () => {
  it('produces same result as addFieldUnit with the same anchor', () => {
    const unit = makeUnit({ anchor: coord('enemy', 1, 0) });
    const base = emptyState();
    const via_placeUnit = placeUnit(unit, base);
    const via_addFieldUnit = addFieldUnit(base, unit, unit.anchor);

    expect(via_placeUnit.units.size).toBe(via_addFieldUnit.units.size);
    expect(via_placeUnit.deployments.get(unit.id)).toEqual(via_addFieldUnit.deployments.get(unit.id));
    expect(via_placeUnit.occupancy.cellToUnitId.size).toBe(via_addFieldUnit.occupancy.cellToUnitId.size);
  });
});

describe('swapFieldUnits passes deployment invariants', () => {
  it('invariants hold after swap', () => {
    const u1 = makeUnit({ anchor: coord('player', 0, 0) });
    const u2 = makeUnit({ anchor: coord('player', 0, 1) });
    let state = emptyState();
    state = addFieldUnit(state, u1, u1.anchor);
    state = addFieldUnit(state, u2, u2.anchor);

    const swapped = swapFieldUnits(state, u1.id, u2.id);
    assertDeploymentInvariants(swapped);
  });
});

describe('autoPlacePlayer sets benchSlotCount', () => {
  it('carries benchSlotCount on the returned state', () => {
    const candidate: PlayerPlacementCandidate = {
      templateId: 'test',
      shape: { offsets: [{ dr: 0, dc: 0 }] },
      rowTrait: 'front',
      savedAnchor: null,
      createUnit: (anchor, id) => makeUnit({ anchor, id }),
    };
    const base = emptyState();
    const result = autoPlacePlayer(base, [candidate], 4);
    expect(result.benchSlotCount).toBe(4);
  });
});
