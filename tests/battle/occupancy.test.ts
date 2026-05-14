import { describe, it, expect } from 'vitest';
import type { UnitDeployment } from '../../src/shared/unitDeploymentTypes';
import { buildOccupancy, removeUnit, getUnitAtCell } from '../../src/battle/occupancy';
import { cellKey } from '../../src/battle/field';
import { makeUnit } from './helpers/units';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { coord } from './helpers/coords';

describe('buildOccupancy', () => {
  it('maps field deployment cells to unit id strings', () => {
    const unit   = makeUnit();
    const anchor = coord('player', 0, 0);
    const units  = new Map([[unit.id, unit]]);
    const deployments = new Map<string, UnitDeployment>([[unit.id, { kind: 'field', anchor }]]);
    const occ = buildOccupancy(units, deployments);

    expect(occ.cellToUnitId.get(cellKey(anchor))).toBe(unit.id);
    expect(typeof occ.cellToUnitId.get(cellKey(anchor))).toBe('string');
  });

  it('ignores bench deployments — bench unit occupies no cells', () => {
    const unit = makeUnit();
    const units = new Map([[unit.id, unit]]);
    const deployments = new Map<string, UnitDeployment>([[unit.id, { kind: 'bench', slot: 0 }]]);
    const occ = buildOccupancy(units, deployments);

    expect(occ.cellToUnitId.size).toBe(0);
    expect(occ.unitToCells.size).toBe(0);
  });

  it('throws when a unit in units has no deployment entry', () => {
    const unit = makeUnit();
    const units = new Map([[unit.id, unit]]);
    const deployments = new Map<string, UnitDeployment>();

    expect(() => buildOccupancy(units, deployments)).toThrow(
      `buildOccupancy: unit "${unit.id}" has no deployment`,
    );
  });

  it('stores string ids in cellToUnitId, not unit objects', () => {
    const unit   = makeUnit({ side: 'enemy' });
    const anchor = coord('enemy', 0, 1);
    const units  = new Map([[unit.id, unit]]);
    const deployments = new Map<string, UnitDeployment>([[unit.id, { kind: 'field', anchor }]]);
    const occ = buildOccupancy(units, deployments);

    const stored = occ.cellToUnitId.get(cellKey(anchor));
    expect(stored).toBe(unit.id);
    expect(stored).not.toBeInstanceOf(Object);
  });
});

describe('removeUnit', () => {
  it('clears cell entries from cellToUnitId and unitToCells', () => {
    const unit   = makeUnit();
    const anchor = coord('player', 0, 0);
    const units  = new Map([[unit.id, unit]]);
    const deployments = new Map<string, UnitDeployment>([[unit.id, { kind: 'field', anchor }]]);
    const occ = buildOccupancy(units, deployments);

    const after = removeUnit(unit.id, occ);
    expect(after.cellToUnitId.size).toBe(0);
    expect(after.unitToCells.has(unit.id)).toBe(false);
  });

  it('does not mutate the original occupancy', () => {
    const unit   = makeUnit();
    const anchor = coord('player', 0, 0);
    const units  = new Map([[unit.id, unit]]);
    const deployments = new Map<string, UnitDeployment>([[unit.id, { kind: 'field', anchor }]]);
    const occ = buildOccupancy(units, deployments);

    removeUnit(unit.id, occ);
    expect(occ.cellToUnitId.size).toBe(1);
  });
});

describe('getUnitAtCell', () => {
  it('returns the unit when one occupies the coord', () => {
    const unit   = makeUnit({ side: 'enemy' });
    const anchor = coord('enemy', 1, 2);
    const state  = makeBattleStateFromUnits({ field: [{ unit, anchor }] });

    const found = getUnitAtCell(state, anchor);
    expect(found?.id).toBe(unit.id);
  });

  it('returns null for an empty cell', () => {
    const unit   = makeUnit({ side: 'enemy' });
    const anchor = coord('enemy', 0, 0);
    const state  = makeBattleStateFromUnits({ field: [{ unit, anchor }] });

    expect(getUnitAtCell(state, coord('player', 0, 0))).toBeNull();
  });
});
