import { describe, it, expect, beforeEach } from 'vitest';
import { canPlace, getDeploymentBlockedCells } from '../../src/battle/placement';
import {
  moveFieldUnit,
  swapFieldUnits,
  swapBenchWithField,
  returnFieldUnitToBench,
} from '../../src/battle/placementState';
import { cellKey } from '../../src/battle/field';
import { makeUnit, resetUnitIdCounter } from './helpers/units';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { coord } from './helpers/coords';

const SHAPE_1x1 = { offsets: [{ dr: 0, dc: 0 }] };

const deadUnit = (id: string, side: 'player' | 'enemy' = 'player') =>
  makeUnit({ id, side, lifeState: 'dead', hp: 0 });

beforeEach(() => resetUnitIdCounter());

describe('getDeploymentBlockedCells', () => {
  it('includes both living and dead field bodies', () => {
    const state = makeBattleStateFromUnits({
      field: [
        { unit: makeUnit({ id: 'alive', side: 'player' }), anchor: coord('player', 0, 0) },
        { unit: deadUnit('dead'), anchor: coord('player', 0, 1) },
      ],
    });

    const blocked = getDeploymentBlockedCells(state);
    expect(blocked.has(cellKey(coord('player', 0, 0)))).toBe(true);
    expect(blocked.has(cellKey(coord('player', 0, 1)))).toBe(true);
  });

  it('excludes bench deployments', () => {
    const state = makeBattleStateFromUnits({
      bench: [{ unit: deadUnit('dead'), slot: 0 }],
      benchSlotCount: 3,
    });
    expect(getDeploymentBlockedCells(state).size).toBe(0);
  });

  it('throws when a deployment references a missing unit', () => {
    const state = makeBattleStateFromUnits({
      field: [{ unit: makeUnit({ id: 'a', side: 'player' }), anchor: coord('player', 0, 0) }],
    });
    state.deployments.set('ghost', { kind: 'field', anchor: coord('player', 1, 1) });
    expect(() => getDeploymentBlockedCells(state)).toThrow(/missing unit/);
  });
});

describe('canPlace — dead bodies block placement', () => {
  it('a dead player field unit blocks its own cell', () => {
    const state = makeBattleStateFromUnits({
      field: [{ unit: deadUnit('dead'), anchor: coord('player', 0, 0) }],
    });
    expect(canPlace(coord('player', 0, 0), SHAPE_1x1, state, 'player')).toBe(false);
    expect(canPlace(coord('player', 0, 1), SHAPE_1x1, state, 'player')).toBe(true);
  });

  it('a dead player unit does NOT block the same row/col on the enemy side', () => {
    const state = makeBattleStateFromUnits({
      field: [{ unit: deadUnit('dead'), anchor: coord('player', 0, 0) }],
    });
    expect(canPlace(coord('enemy', 0, 0), SHAPE_1x1, state, 'enemy')).toBe(true);
  });

  it('a dead enemy field unit follows the symmetric side rule', () => {
    const state = makeBattleStateFromUnits({
      field: [{ unit: deadUnit('dead-e', 'enemy'), anchor: coord('enemy', 1, 2) }],
    });
    expect(canPlace(coord('enemy', 1, 2), SHAPE_1x1, state, 'enemy')).toBe(false);
    expect(canPlace(coord('player', 1, 2), SHAPE_1x1, state, 'player')).toBe(true);
  });

  it('dead/dead overlap is rejected', () => {
    const state = makeBattleStateFromUnits({
      field: [{ unit: deadUnit('dead-1'), anchor: coord('player', 1, 1) }],
    });
    expect(canPlace(coord('player', 1, 1), SHAPE_1x1, state, 'player')).toBe(false);
  });

  it('dead/living overlap is rejected in both directions', () => {
    const withDead = makeBattleStateFromUnits({
      field: [{ unit: deadUnit('dead-1'), anchor: coord('player', 1, 0) }],
    });
    expect(canPlace(coord('player', 1, 0), SHAPE_1x1, withDead, 'player')).toBe(false);

    const withLiving = makeBattleStateFromUnits({
      field: [{ unit: makeUnit({ id: 'alive', side: 'player' }), anchor: coord('player', 1, 0) }],
    });
    expect(canPlace(coord('player', 1, 0), SHAPE_1x1, withLiving, 'player')).toBe(false);
  });
});

describe('combat occupancy still excludes dead field units', () => {
  it('a dead field unit occupies no combat cell', () => {
    const state = makeBattleStateFromUnits({
      field: [
        { unit: makeUnit({ id: 'alive', side: 'player' }), anchor: coord('player', 0, 0) },
        { unit: deadUnit('dead'), anchor: coord('player', 0, 1) },
      ],
    });

    expect(state.occupancy.cellToUnitId.has(cellKey(coord('player', 0, 0)))).toBe(true);
    expect(state.occupancy.cellToUnitId.has(cellKey(coord('player', 0, 1)))).toBe(false);
    expect(state.occupancy.unitToCells.has('dead')).toBe(false);
  });
});

describe('placement actions work on dead units', () => {
  it('a dead field unit can be moved to a free cell', () => {
    const state = makeBattleStateFromUnits({
      field: [{ unit: deadUnit('dead'), anchor: coord('player', 0, 0) }],
      benchSlotCount: 3,
    }, { phase: 'placement' });

    const next = moveFieldUnit(state, 'dead', coord('player', 1, 2));
    const dep  = next.deployments.get('dead')!;
    expect(dep).toEqual({ kind: 'field', anchor: coord('player', 1, 2) });
    // Still no combat occupancy after the move.
    expect(next.occupancy.unitToCells.has('dead')).toBe(false);
  });

  it('a dead field unit cannot be moved onto another body', () => {
    const state = makeBattleStateFromUnits({
      field: [
        { unit: deadUnit('dead'), anchor: coord('player', 0, 0) },
        { unit: makeUnit({ id: 'alive', side: 'player' }), anchor: coord('player', 0, 1) },
      ],
    }, { phase: 'placement' });

    const next = moveFieldUnit(state, 'dead', coord('player', 0, 1));
    expect(next.deployments.get('dead')).toEqual({ kind: 'field', anchor: coord('player', 0, 0) });
  });

  it('two dead field units can swap positions', () => {
    const a = coord('player', 0, 0);
    const b = coord('player', 1, 1);
    const state = makeBattleStateFromUnits({
      field: [
        { unit: deadUnit('dead-a'), anchor: a },
        { unit: deadUnit('dead-b'), anchor: b },
      ],
    }, { phase: 'placement' });

    const next = swapFieldUnits(state, 'dead-a', 'dead-b');
    expect(next.deployments.get('dead-a')).toEqual({ kind: 'field', anchor: b });
    expect(next.deployments.get('dead-b')).toEqual({ kind: 'field', anchor: a });
  });

  it('a dead bench unit can swap with a living field unit', () => {
    const anchor = coord('player', 0, 0);
    const benchUnit = deadUnit('dead-bench');
    const fieldUnit = makeUnit({ id: 'alive', side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [{ unit: fieldUnit, anchor }],
      bench: [{ unit: benchUnit, slot: 0 }],
      benchSlotCount: 3,
    }, { phase: 'placement' });

    const next = swapBenchWithField(state, benchUnit, 0, fieldUnit);
    expect(next.deployments.get('dead-bench')).toEqual({ kind: 'field', anchor });
    expect(next.deployments.get('alive')).toEqual({ kind: 'bench', slot: 0 });
  });

  it('a dead field unit can be returned to the bench', () => {
    const state = makeBattleStateFromUnits({
      field: [{ unit: deadUnit('dead'), anchor: coord('player', 0, 0) }],
      benchSlotCount: 3,
    }, { phase: 'placement' });

    const next = returnFieldUnitToBench(state, 'dead');
    expect(next.deployments.get('dead')).toEqual({ kind: 'bench', slot: 0 });
    // Its former cell is now free for placement.
    expect(canPlace(coord('player', 0, 0), SHAPE_1x1, next, 'player')).toBe(true);
  });
});
