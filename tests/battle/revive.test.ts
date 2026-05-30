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
  it('level 1 returns ceil(maxHp * 10 / 100)', () => {
    expect(computeReviveHp({ maxHp: 100 }, { level: 1 })).toBe(10);
    expect(computeReviveHp({ maxHp: 95 },  { level: 1 })).toBe(10); // 9.5 → 10
    expect(computeReviveHp({ maxHp: 11 },  { level: 1 })).toBe(2);  // 1.1 → 2
  });

  it('level 2 returns ceil(maxHp * 20 / 100)', () => {
    expect(computeReviveHp({ maxHp: 100 }, { level: 2 })).toBe(20);
    expect(computeReviveHp({ maxHp: 91 },  { level: 2 })).toBe(19); // 18.2 → 19
  });

  it('level 3 returns ceil(maxHp * 30 / 100)', () => {
    expect(computeReviveHp({ maxHp: 100 }, { level: 3 })).toBe(30);
    expect(computeReviveHp({ maxHp: 7 },   { level: 3 })).toBe(3);  // 2.1 → 3
  });

  it('always returns at least 1', () => {
    expect(computeReviveHp({ maxHp: 1 }, { level: 1 })).toBe(1);
    expect(computeReviveHp({ maxHp: 0 }, { level: 1 })).toBe(1);
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

    expect(result!.hpRestored).toBe(20);
    expect(isAlive(revived)).toBe(true);
    expect(revived.lifeState).toBe('alive');
    expect(revived.hp).toBe(20);
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
    expect(result!.hpRestored).toBe(10);
    expect(isAlive(result!.state.units.get('enemy')!)).toBe(true);
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
