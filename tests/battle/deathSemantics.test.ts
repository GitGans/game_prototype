import { describe, it, expect } from 'vitest';
import { makeUnit } from './helpers/units';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { coord } from './helpers/coords';
import { cellKey } from '../../src/battle/field';
import { buildOccupancy } from '../../src/battle/occupancy';
import {
  getFieldUnits,
  getLivingFieldUnits,
  getDeadFieldUnits,
  getLivingFieldUnitEntries,
  getDeadFieldUnitEntries,
} from '../../src/battle/deployment';
import { killUnit, isAlive } from '../../src/battle/lifeState';
import { buildRoundQueue, pruneQueue, rebuildRemainingQueue } from '../../src/battle/initiative';
import { checkGameOver } from '../../src/battle/combat';
import { addBenchUnit } from '../../src/battle/placement';

function setDead(state: ReturnType<typeof makeBattleStateFromUnits>, id: string) {
  const u = state.units.get(id)!;
  const units = new Map(state.units);
  units.set(id, killUnit(u));
  return { ...state, units, occupancy: buildOccupancy(units, state.deployments) };
}

describe('deployment helpers — living/dead split', () => {
  it('getFieldUnits includes dead field units; getLivingFieldUnits excludes them; getDeadFieldUnits returns them', () => {
    const aliveUnit = makeUnit({ side: 'player' });
    const deadUnit  = makeUnit({ side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: aliveUnit, anchor: coord('player', 0, 0) },
        { unit: deadUnit,  anchor: coord('enemy', 0, 0) },
      ],
    });
    state = setDead(state, deadUnit.id);

    expect(getFieldUnits(state).map(u => u.id).sort())
      .toEqual([aliveUnit.id, deadUnit.id].sort());
    expect(getLivingFieldUnits(state).map(u => u.id)).toEqual([aliveUnit.id]);
    expect(getDeadFieldUnits(state).map(u => u.id)).toEqual([deadUnit.id]);
    expect(getLivingFieldUnitEntries(state).map(([id]) => id)).toEqual([aliveUnit.id]);
    expect(getDeadFieldUnitEntries(state).map(([id]) => id)).toEqual([deadUnit.id]);
  });

  it('living/dead helpers ignore bench units', () => {
    const aliveField = makeUnit({ side: 'player' });
    const benchUnit  = makeUnit({ side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [{ unit: aliveField, anchor: coord('player', 0, 0) }],
      bench: [],
      benchSlotCount: 3,
    });
    state = addBenchUnit(state, benchUnit, 0);

    expect(getLivingFieldUnits(state).map(u => u.id)).toEqual([aliveField.id]);
    expect(getDeadFieldUnits(state)).toEqual([]);
  });
});

describe('buildOccupancy — living-only', () => {
  it('dead field unit with deployment occupies no cells', () => {
    const dead = makeUnit({ id: 'd', side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [{ unit: dead, anchor: coord('enemy', 0, 0) }],
    });
    state = setDead(state, 'd');

    expect(state.occupancy.cellToUnitId.has(cellKey(coord('enemy', 0, 0)))).toBe(false);
    expect(state.occupancy.unitToCells.has('d')).toBe(false);
    // Deployment still present
    expect(state.deployments.has('d')).toBe(true);
  });

  it('alive field units still block cells', () => {
    const alive = makeUnit({ id: 'a', side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [{ unit: alive, anchor: coord('player', 0, 0) }],
    });
    expect(state.occupancy.cellToUnitId.get(cellKey(coord('player', 0, 0)))).toBe('a');
    expect(state.occupancy.unitToCells.get('a')).toHaveLength(1);
  });
});

describe('initiative — living-only queues', () => {
  it('buildRoundQueue excludes dead units', () => {
    const alive = makeUnit({ id: 'a', initiative: 10 });
    const dead  = makeUnit({ id: 'd', initiative: 20, lifeState: 'dead', hp: 0, activeEffects: [] });
    const queue = buildRoundQueue(new Map([[alive.id, alive], [dead.id, dead]]));
    expect(queue).toEqual(['a']);
  });

  it('pruneQueue removes dead ids', () => {
    const alive = makeUnit({ id: 'a' });
    const dead  = makeUnit({ id: 'd', lifeState: 'dead', hp: 0, activeEffects: [] });
    const units = new Map([[alive.id, alive], [dead.id, dead]]);
    expect(pruneQueue(['a', 'd'], units)).toEqual(['a']);
  });

  it('rebuildRemainingQueue removes dead ids from both pools and does not introduce non-remaining ids', () => {
    const a = makeUnit({ id: 'a', initiative: 30 });
    const b = makeUnit({ id: 'b', initiative: 20 });
    const c = makeUnit({ id: 'c', initiative: 50 });
    const d = makeUnit({ id: 'd', initiative: 40, lifeState: 'dead', hp: 0, activeEffects: [] });
    const units = new Map([[a.id, a], [b.id, b], [c.id, c], [d.id, d]]);

    // remaining intentionally excludes 'c' even though it's alive — must not be reintroduced.
    const out = rebuildRemainingQueue('current', ['a', 'b', 'd'], new Set(['b']), units);

    expect(out[0]).toBe('current');
    expect(out).not.toContain('d'); // dead dropped
    expect(out).not.toContain('c'); // never injected
    expect(out).toContain('a');
    expect(out).toContain('b');
  });
});

describe('checkGameOver — living-only', () => {
  it('returns "player" when all player field units are dead but a bench player + alive enemy remain', () => {
    const deadPlayer  = makeUnit({ id: 'dp', side: 'player' });
    const enemy       = makeUnit({ id: 'e',  side: 'enemy'  });
    const benchPlayer = makeUnit({ id: 'bp', side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: deadPlayer, anchor: coord('player', 0, 0) },
        { unit: enemy,      anchor: coord('enemy', 0, 0) },
      ],
      bench: [{ unit: benchPlayer, slot: 0 }],
      benchSlotCount: 1,
    });
    state = setDead(state, 'dp');

    expect(checkGameOver(state)).toBe('player');
  });

  it('returns null while both sides have living field units', () => {
    const p = makeUnit({ id: 'p', side: 'player' });
    const e = makeUnit({ id: 'e', side: 'enemy' });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: p, anchor: coord('player', 0, 0) },
        { unit: e, anchor: coord('enemy', 0, 0) },
      ],
    });
    expect(checkGameOver(state)).toBeNull();
  });
});

describe('isAlive predicate', () => {
  it('is true for canonical alive, false for canonical dead', () => {
    expect(isAlive(makeUnit())).toBe(true);
    expect(isAlive(makeUnit({ lifeState: 'dead', hp: 0, activeEffects: [] }))).toBe(false);
  });
});
