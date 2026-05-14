import { describe, it, expect } from 'vitest';
import type { UnitDeployment } from '../../src/shared/unitDeploymentTypes';
import {
  getDeployment,
  requireDeployment,
  isFieldUnit,
  isBenchUnit,
  getFieldUnitEntries,
  getFieldUnits,
  getBenchSlotOccupant,
  getFreeBenchSlot,
  removeDeployment,
  retainDeploymentsForUnits,
} from '../../src/battle/deployment';
import { addBenchUnit, addFieldUnit } from '../../src/battle/placement';
import { makeUnit } from './helpers/units';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { coord } from './helpers/coords';

function stateWithBenchSlots(benchSlotCount: number) {
  return { ...makeBattleStateFromUnits([]), benchSlotCount };
}

describe('isFieldUnit / isBenchUnit', () => {
  it('returns true for field-deployed unit', () => {
    const unit = makeUnit({ anchor: coord('player', 0, 0) });
    const state = makeBattleStateFromUnits([unit]);
    expect(isFieldUnit(state, unit.id)).toBe(true);
    expect(isBenchUnit(state, unit.id)).toBe(false);
  });

  it('returns true for bench-deployed unit', () => {
    const unit = makeUnit({ anchor: coord('player', 0, 0) });
    let state = stateWithBenchSlots(3);
    state = addBenchUnit(state, unit, 0);
    expect(isBenchUnit(state, unit.id)).toBe(true);
    expect(isFieldUnit(state, unit.id)).toBe(false);
  });

  it('returns false for unknown unit id', () => {
    const state = makeBattleStateFromUnits([]);
    expect(isFieldUnit(state, 'nonexistent')).toBe(false);
    expect(isBenchUnit(state, 'nonexistent')).toBe(false);
  });
});

describe('getFieldUnitEntries / getFieldUnits', () => {
  it('excludes bench-deployed units', () => {
    const fieldUnit = makeUnit({ anchor: coord('player', 0, 0) });
    const benchUnit = makeUnit({ anchor: coord('player', 0, 1) });
    let state = stateWithBenchSlots(3);
    state = addFieldUnit(state, fieldUnit, fieldUnit.anchor);
    state = addBenchUnit(state, benchUnit, 0);

    const entries = getFieldUnitEntries(state);
    expect(entries).toHaveLength(1);
    expect(entries[0][0]).toBe(fieldUnit.id);

    const units = getFieldUnits(state);
    expect(units).toHaveLength(1);
    expect(units[0].id).toBe(fieldUnit.id);
  });
});

describe('getBenchSlotOccupant', () => {
  it('returns the unit at the given slot', () => {
    const unit = makeUnit({ anchor: coord('player', 0, 0) });
    let state = stateWithBenchSlots(3);
    state = addBenchUnit(state, unit, 1);
    expect(getBenchSlotOccupant(state, 1)?.id).toBe(unit.id);
  });

  it('returns undefined for an empty slot', () => {
    let state = stateWithBenchSlots(3);
    expect(getBenchSlotOccupant(state, 0)).toBeUndefined();
  });
});

describe('getFreeBenchSlot', () => {
  it('returns the first unoccupied slot', () => {
    const unit = makeUnit({ anchor: coord('player', 0, 0) });
    let state = stateWithBenchSlots(3);
    state = addBenchUnit(state, unit, 0);
    expect(getFreeBenchSlot(state)).toBe(1);
  });

  it('returns null when all slots are filled', () => {
    const u0 = makeUnit({ anchor: coord('player', 0, 0) });
    const u1 = makeUnit({ anchor: coord('player', 0, 1) });
    let state = stateWithBenchSlots(2);
    state = addBenchUnit(state, u0, 0);
    state = addBenchUnit(state, u1, 1);
    expect(getFreeBenchSlot(state)).toBeNull();
  });

  it('returns null when benchSlotCount is 0', () => {
    const state = stateWithBenchSlots(0);
    expect(getFreeBenchSlot(state)).toBeNull();
  });
});

describe('removeDeployment', () => {
  it('removes the entry without mutating the input map', () => {
    const unit = makeUnit({ anchor: coord('player', 0, 0) });
    const state = makeBattleStateFromUnits([unit]);
    const original = new Map(state.deployments);

    const next = removeDeployment(state.deployments, unit.id);
    expect(next.has(unit.id)).toBe(false);
    expect(state.deployments.size).toBe(original.size); // original unchanged
  });
});

describe('retainDeploymentsForUnits', () => {
  it('keeps only entries whose unit id is in the units map', () => {
    const alive = makeUnit({ anchor: coord('enemy', 0, 0) });
    const dead = makeUnit({ anchor: coord('enemy', 0, 1) });
    const state = makeBattleStateFromUnits([alive, dead]);

    const survivors = new Map([[alive.id, alive]]);
    const retained = retainDeploymentsForUnits(state.deployments, survivors);

    expect(retained.has(alive.id)).toBe(true);
    expect(retained.has(dead.id)).toBe(false);
  });
});

describe('getDeployment / requireDeployment', () => {
  it('getDeployment returns undefined for unknown id', () => {
    const state = makeBattleStateFromUnits([]);
    expect(getDeployment(state, 'nope')).toBeUndefined();
  });

  it('requireDeployment throws for unknown id', () => {
    const state = makeBattleStateFromUnits([]);
    expect(() => requireDeployment(state, 'nope')).toThrow('requireDeployment: no deployment for unit "nope"');
  });
});
