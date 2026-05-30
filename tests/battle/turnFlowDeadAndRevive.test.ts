import { describe, it, expect, beforeEach } from 'vitest';
import { skipActiveTurn, chargeActiveTurn, createTurnContext } from '../../src/battle/turnResolver';
import { decideAutoTurn } from '../../src/battle/autoTurn';
import { computeOneTurn } from '../../src/battle/quickTurn';
import { buildRoundQueue } from '../../src/battle/initiative';
import { getLivingFieldUnitEntries } from '../../src/battle/deployment';
import { killUnit, reviveUnit } from '../../src/battle/lifeState';
import { buildOccupancy } from '../../src/battle/occupancy';
import type { BattleState } from '../../src/battle/types';
import { makeUnit, resetUnitIdCounter } from './helpers/units';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { coord } from './helpers/coords';
import { fixedRng } from './helpers/rng';

function setDead(state: BattleState, id: string): BattleState {
  const u = state.units.get(id)!;
  const units = new Map(state.units);
  units.set(id, killUnit(u));
  return { ...state, units, occupancy: buildOccupancy(units, state.deployments) };
}

beforeEach(() => resetUnitIdCounter());

describe('turn flow recovers from dead active unit', () => {
  it('skipActiveTurn: dead roundQueue[0] is advanced instead of emitting turn_skipped', () => {
    const dead = makeUnit({ id: 'dead', side: 'player', initiative: 50 });
    const alive = makeUnit({ id: 'alive', side: 'player', initiative: 40 });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: dead,  anchor: coord('player', 0, 0) },
        { unit: alive, anchor: coord('player', 0, 1) },
      ],
    });
    state = setDead(state, 'dead');
    state = { ...state, roundQueue: ['dead', 'alive'] };

    const result = skipActiveTurn({ state, context: createTurnContext() });
    expect(result.skipped).toBe(false);
    expect(result.events.find(e => e.type === 'turn_skipped')).toBeUndefined();
    expect(result.state.roundQueue[0]).toBe('alive');
  });

  it('chargeActiveTurn: dead roundQueue[0] is advanced instead of emitting turn_charged', () => {
    const dead = makeUnit({ id: 'dead', side: 'enemy', initiative: 50 });
    const alive = makeUnit({ id: 'alive', side: 'enemy', initiative: 40 });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: dead,  anchor: coord('enemy', 0, 0) },
        { unit: alive, anchor: coord('enemy', 0, 1) },
      ],
    });
    state = setDead(state, 'dead');
    state = { ...state, roundQueue: ['dead', 'alive'] };

    const result = chargeActiveTurn({ state, context: createTurnContext() });
    expect(result.charged).toBe(false);
    expect(result.events.find(e => e.type === 'turn_charged')).toBeUndefined();
    expect(result.state.roundQueue[0]).toBe('alive');
  });

  it('decideAutoTurn: dead enemy active unit returns restart_turn (no skill execution)', () => {
    const dead = makeUnit({ id: 'dead', side: 'enemy' });
    const alive = makeUnit({ id: 'alive', side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: dead,  anchor: coord('enemy',  0, 0) },
        { unit: alive, anchor: coord('player', 0, 0) },
      ],
    });
    state = setDead(state, 'dead');
    state = { ...state, roundQueue: ['dead', 'alive'] };

    const decision = decideAutoTurn({ state, mode: 'auto', rng: fixedRng(0.5) });
    expect(decision.type).toBe('restart_turn');
  });

  it('computeOneTurn (quickTurn): dead active unit returns state unchanged', () => {
    const dead = makeUnit({ id: 'dead', side: 'player' });
    const enemy = makeUnit({ id: 'e', side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: dead,  anchor: coord('player', 0, 0) },
        { unit: enemy, anchor: coord('enemy',  0, 0) },
      ],
    });
    state = setDead(state, 'dead');

    const after = computeOneTurn(state, 'dead', {
      rng: fixedRng(0.5),
      queueContext: { chargedThisRound: new Set() },
    });
    expect(after).toBe(state);
  });
});

// Future revive invariant: this is the most important test in the stage —
// it pre-bakes the contract every future resurrection skill must respect.
describe('future revive safety — current round queue is not modified by revive', () => {
  function makeFreshlyDeadState(deadSide: 'player' | 'enemy') {
    const otherSide = deadSide === 'player' ? 'enemy' : 'player';
    const actor    = makeUnit({ id: 'actor',    side: otherSide, initiative: 50 });
    const ally     = makeUnit({ id: 'ally',     side: deadSide,  initiative: 30 });
    const corpse   = makeUnit({ id: 'corpse',   side: deadSide,  initiative: 40 });

    let state = makeBattleStateFromUnits({
      field: [
        { unit: actor,  anchor: coord(otherSide, 0, 0) },
        { unit: ally,   anchor: coord(deadSide,  0, 0) },
        { unit: corpse, anchor: coord(deadSide,  0, 1) },
      ],
    });
    // Simulate the corpse died mid-round; the queue was pruned and now reflects
    // only the living remaining units.
    state = setDead(state, 'corpse');
    const livingQueue = buildRoundQueue(new Map(getLivingFieldUnitEntries(state)));
    state = { ...state, roundQueue: livingQueue };

    // Sanity: the corpse is NOT in the current queue.
    expect(state.roundQueue).not.toContain('corpse');
    return state;
  }

  for (const side of ['player', 'enemy'] as const) {
    it(`${side} corpse: revive does not enter current roundQueue, but joins a newly built round queue`, () => {
      const state = makeFreshlyDeadState(side);
      const before = state.roundQueue.slice();

      // Revive via the primitive.
      const revived = reviveUnit(state.units.get('corpse')!, 5);
      const nextUnits = new Map(state.units);
      nextUnits.set('corpse', revived);
      const nextState: BattleState = {
        ...state,
        units: nextUnits,
        occupancy: buildOccupancy(nextUnits, state.deployments),
      };

      // Current round queue is untouched — no future revive skill can splice a
      // revived id back into the in-progress round.
      expect(nextState.roundQueue).toEqual(before);

      // A NEW round queue built from living field units now includes the
      // revived unit. Mirror the production contract: "next round queue is
      // built from living field units," so feed `getLivingFieldUnitEntries`,
      // not the whole units map.
      const nextRoundQueue = buildRoundQueue(new Map(getLivingFieldUnitEntries(nextState)));
      expect(nextRoundQueue).toContain('corpse');
    });
  }
});
