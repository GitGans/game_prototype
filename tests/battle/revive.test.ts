import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeReviveHp,
  reviveUnitInBattle,
} from '../../src/battle/revive';
import { killUnit, isAlive, isDead } from '../../src/battle/lifeState';
import { buildOccupancy } from '../../src/battle/occupancy';
import { buildRoundQueue } from '../../src/battle/initiative';
import { getLivingFieldUnitEntries } from '../../src/battle/deployment';
import { getOccupiedCells } from '../../src/battle/shapes';
import { cellKey } from '../../src/battle/field';
import { SHAPES } from '../../src/data/shapeDefinitions';
import type { BattleState } from '../../src/battle/types';
import { makeUnit, resetUnitIdCounter } from './helpers/units';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { coord } from './helpers/coords';

function setDead(state: BattleState, id: string): BattleState {
  const u = state.units.get(id)!;
  const units = new Map(state.units);
  units.set(id, killUnit(u));
  return { ...state, units, occupancy: buildOccupancy(units, state.deployments) };
}

beforeEach(() => resetUnitIdCounter());

describe('computeReviveHp', () => {
  it('returns an integer', () => {
    for (const maxHp of [1, 7, 11, 95, 100, 200]) {
      for (const level of [1, 2, 3] as const) {
        expect(Number.isInteger(computeReviveHp({ maxHp }, { level }))).toBe(true);
      }
    }
  });

  it('returns at least 1', () => {
    expect(computeReviveHp({ maxHp: 1 }, { level: 1 })).toBeGreaterThanOrEqual(1);
    expect(computeReviveHp({ maxHp: 0 }, { level: 1 })).toBeGreaterThanOrEqual(1);
  });

  it('never exceeds maxHp (for maxHp > 0)', () => {
    for (const maxHp of [1, 5, 10, 100]) {
      for (const level of [1, 2, 3] as const) {
        expect(computeReviveHp({ maxHp }, { level })).toBeLessThanOrEqual(maxHp);
      }
    }
  });

  it('is monotonic non-decreasing in level for a given maxHp', () => {
    for (const maxHp of [10, 50, 100, 200]) {
      const h1 = computeReviveHp({ maxHp }, { level: 1 });
      const h2 = computeReviveHp({ maxHp }, { level: 2 });
      const h3 = computeReviveHp({ maxHp }, { level: 3 });
      expect(h2).toBeGreaterThanOrEqual(h1);
      expect(h3).toBeGreaterThanOrEqual(h2);
    }
  });

  it('is monotonic non-decreasing in maxHp for a given level', () => {
    for (const level of [1, 2, 3] as const) {
      const a = computeReviveHp({ maxHp: 10 },  { level });
      const b = computeReviveHp({ maxHp: 100 }, { level });
      const c = computeReviveHp({ maxHp: 200 }, { level });
      expect(b).toBeGreaterThanOrEqual(a);
      expect(c).toBeGreaterThanOrEqual(b);
    }
  });

  it('invalid level 0 throws via requireSkillLevel', () => {
    expect(() => computeReviveHp({ maxHp: 100 }, { level: 0 as 1 })).toThrow(/revive/);
  });

  it('invalid level 99 throws via requireSkillLevel', () => {
    expect(() => computeReviveHp({ maxHp: 100 }, { level: 99 as 1 })).toThrow(/revive/);
  });
});

describe('reviveUnitInBattle', () => {
  it('revives a dead player field unit and rebuilds occupancy', () => {
    const caster   = makeUnit({ id: 'caster',   side: 'player' });
    const deadAlly = makeUnit({ id: 'deadAlly', side: 'player', maxHp: 100 });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,   anchor: coord('player', 0, 0) },
        { unit: deadAlly, anchor: coord('player', 1, 1) },
      ],
    });
    state = setDead(state, 'deadAlly');
    expect(state.occupancy.cellToUnitId.get(cellKey(coord('player', 1, 1)))).toBeUndefined();

    const result = reviveUnitInBattle(state, 'deadAlly', { level: 2 });
    expect(result).not.toBeNull();
    const next = result!.state;
    const revived = next.units.get('deadAlly')!;

    const expected = computeReviveHp({ maxHp: revived.maxHp }, { level: 2 });
    expect(result!.hpRestored).toBe(expected);
    expect(isAlive(revived)).toBe(true);
    expect(revived.lifeState).toBe('alive');
    expect(revived.hp).toBe(expected);
    expect(revived.activeEffects).toEqual([]);
    expect(next.deployments.get('deadAlly')).toBe(state.deployments.get('deadAlly'));
    expect(next.occupancy.cellToUnitId.get(cellKey(coord('player', 1, 1)))).toBe('deadAlly');
  });

  it('revives a dead enemy field unit when called explicitly', () => {
    const enemy = makeUnit({ id: 'enemy', side: 'enemy', maxHp: 100 });
    let state = makeBattleStateFromUnits({
      field: [{ unit: enemy, anchor: coord('enemy', 0, 0) }],
    });
    state = setDead(state, 'enemy');

    const result = reviveUnitInBattle(state, 'enemy', { level: 1 });
    expect(result).not.toBeNull();
    const revived = result!.state.units.get('enemy')!;
    expect(result!.hpRestored).toBe(revived.hp);
    expect(isAlive(revived)).toBe(true);
  });

  it('revives a multi-cell corpse and registers all body cells in occupancy', () => {
    const giant = makeUnit({
      id: 'giant',
      side: 'player',
      maxHp: 200,
      shape: SHAPES['1x2'],
    });
    let state = makeBattleStateFromUnits({
      field: [{ unit: giant, anchor: coord('player', 0, 0) }],
    });
    state = setDead(state, 'giant');

    const result = reviveUnitInBattle(state, 'giant', { level: 1 });
    expect(result).not.toBeNull();
    const occ = result!.state.occupancy;
    const cells = getOccupiedCells(coord('player', 0, 0), SHAPES['1x2']);
    for (const c of cells) {
      expect(occ.cellToUnitId.get(cellKey(c))).toBe('giant');
    }
  });

  it('returns null for missing id', () => {
    const caster = makeUnit({ id: 'caster', side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [{ unit: caster, anchor: coord('player', 0, 0) }],
    });
    expect(reviveUnitInBattle(state, 'ghost', { level: 1 })).toBeNull();
  });

  it('returns null for a living unit', () => {
    const ally = makeUnit({ id: 'ally', side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [{ unit: ally, anchor: coord('player', 0, 0) }],
    });
    expect(reviveUnitInBattle(state, 'ally', { level: 1 })).toBeNull();
  });

  it('returns null for a dead bench unit', () => {
    const benchUnit = makeUnit({ id: 'benched', side: 'player' });
    let state = makeBattleStateFromUnits({
      bench: [{ unit: benchUnit, slot: 0 }],
      benchSlotCount: 1,
    });
    state = setDead(state, 'benched');
    expect(reviveUnitInBattle(state, 'benched', { level: 1 })).toBeNull();
  });

  it('does not mutate current roundQueue reference', () => {
    const caster   = makeUnit({ id: 'caster',   side: 'player', initiative: 50 });
    const deadAlly = makeUnit({ id: 'deadAlly', side: 'player', initiative: 30 });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,   anchor: coord('player', 0, 0) },
        { unit: deadAlly, anchor: coord('player', 1, 0) },
      ],
    });
    state = setDead(state, 'deadAlly');
    // Realistic precondition: dead unit was already pruned from the queue when
    // it died. Revive must not re-insert it into this queue.
    state = { ...state, roundQueue: ['caster'] };
    const queueBefore = state.roundQueue;

    const next = reviveUnitInBattle(state, 'deadAlly', { level: 1 })!.state;
    expect(Object.is(next.roundQueue, queueBefore)).toBe(true);
    expect(next.roundQueue.includes('deadAlly')).toBe(false);
  });
});

describe('revive queue rebuild semantics', () => {
  it('revived unit appears in a later buildRoundQueue call', () => {
    const caster   = makeUnit({ id: 'caster',   side: 'player', initiative: 50 });
    const deadAlly = makeUnit({ id: 'deadAlly', side: 'player', initiative: 30 });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,   anchor: coord('player', 0, 0) },
        { unit: deadAlly, anchor: coord('player', 1, 0) },
      ],
    });
    state = setDead(state, 'deadAlly');
    state = { ...state, roundQueue: ['caster'] };

    const next = reviveUnitInBattle(state, 'deadAlly', { level: 1 })!.state;

    // Current queue still does not include the revived unit.
    expect(next.roundQueue.includes('deadAlly')).toBe(false);

    // But a fresh queue built from living field units does.
    const livingEntries = new Map(getLivingFieldUnitEntries(next));
    const rebuilt = buildRoundQueue(livingEntries);
    expect(rebuilt.includes('deadAlly')).toBe(true);
  });

  it('isDead/isAlive flip as expected after revive', () => {
    const deadAlly = makeUnit({ id: 'deadAlly', side: 'player', maxHp: 100 });
    let state = makeBattleStateFromUnits({
      field: [{ unit: deadAlly, anchor: coord('player', 0, 0) }],
    });
    state = setDead(state, 'deadAlly');
    expect(isDead(state.units.get('deadAlly')!)).toBe(true);

    const next = reviveUnitInBattle(state, 'deadAlly', { level: 1 })!.state;
    expect(isAlive(next.units.get('deadAlly')!)).toBe(true);
    expect(isDead(next.units.get('deadAlly')!)).toBe(false);
  });
});
