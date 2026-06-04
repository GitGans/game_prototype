import { describe, it, expect, beforeEach } from 'vitest';
import { getDeadFriendlyUnitAtCell } from '../../src/battle/targeting';
import { getDeadFriendlyCorpseCells } from '../../src/battle/deadFriendlyTargeting';
import { killUnit } from '../../src/battle/lifeState';
import { buildOccupancy } from '../../src/battle/occupancy';
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

describe('getDeadFriendlyUnitAtCell', () => {
  it('returns the dead unit covering the queried cell', () => {
    const caster   = makeUnit({ side: 'player' });
    const deadAlly = makeUnit({ side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,   anchor: coord('player', 0, 0) },
        { unit: deadAlly, anchor: coord('player', 1, 1) },
      ],
    });
    state = setDead(state, deadAlly.id);

    const hit = getDeadFriendlyUnitAtCell(state, 'player', coord('player', 1, 1));
    expect(hit?.id).toBe(deadAlly.id);
  });

  it('returns null for a mirrored wrong-side coord even when row/col match', () => {
    const caster   = makeUnit({ side: 'player' });
    const deadAlly = makeUnit({ side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,   anchor: coord('player', 0, 0) },
        { unit: deadAlly, anchor: coord('player', 1, 1) },
      ],
    });
    state = setDead(state, deadAlly.id);

    // Same row/col, opposite side: must NOT match the player-side corpse.
    const hit = getDeadFriendlyUnitAtCell(state, 'player', coord('enemy', 1, 1));
    expect(hit).toBeNull();
  });

  it('returns null when the cell has no dead friendly', () => {
    const caster = makeUnit({ side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [{ unit: caster, anchor: coord('player', 0, 0) }],
    });

    const hit = getDeadFriendlyUnitAtCell(state, 'player', coord('player', 1, 1));
    expect(hit).toBeNull();
  });
});

describe('getDeadFriendlyCorpseCells', () => {
  it('excludes living allies, dead enemies, and dead bench units', () => {
    const caster      = makeUnit({ side: 'player' });
    const livingAlly  = makeUnit({ side: 'player' });
    const deadAlly    = makeUnit({ side: 'player' });
    const deadEnemy   = makeUnit({ side: 'enemy' });
    const deadBench   = makeUnit({ side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,     anchor: coord('player', 0, 0) },
        { unit: livingAlly, anchor: coord('player', 0, 1) },
        { unit: deadAlly,   anchor: coord('player', 1, 0) },
        { unit: deadEnemy,  anchor: coord('enemy',  0, 0) },
      ],
      bench: [{ unit: deadBench, slot: 0 }],
      benchSlotCount: 1,
    });
    state = setDead(state, deadAlly.id);
    state = setDead(state, deadEnemy.id);
    state = setDead(state, deadBench.id);

    const result = getDeadFriendlyCorpseCells({
      units:       state.units,
      deployments: state.deployments,
      casterSide:  'player',
    });

    expect(result.map(({ unit }) => unit.id)).toEqual([deadAlly.id]);
    expect(result[0].cell).toEqual(coord('player', 1, 0));
  });
});
