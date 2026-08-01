import { describe, it, expect, beforeEach } from 'vitest';
import { canBeginCombat } from '../../src/battle/combatStart';
import { applyBattleLifecycleAction } from '../../src/core/phaseHandlers/battlePhaseHandler';
import { makeUnit, resetUnitIdCounter } from './helpers/units';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { coord } from './helpers/coords';

const dead = (id: string, side: 'player' | 'enemy' = 'player') =>
  makeUnit({ id, side, lifeState: 'dead', hp: 0 });

beforeEach(() => resetUnitIdCounter());

describe('canBeginCombat', () => {
  it('is false when only dead player units hold the field', () => {
    const state = makeBattleStateFromUnits({
      field: [
        { unit: dead('dead-1'), anchor: coord('player', 0, 0) },
        { unit: dead('dead-2'), anchor: coord('player', 0, 1) },
        { unit: makeUnit({ id: 'enemy-1', side: 'enemy' }), anchor: coord('enemy', 0, 0) },
      ],
      bench: [{ unit: makeUnit({ id: 'benched', side: 'player' }), slot: 0 }],
      benchSlotCount: 3,
    }, { phase: 'placement' });

    expect(canBeginCombat(state)).toBe(false);
  });

  it('is true with at least one living player unit on the field', () => {
    const state = makeBattleStateFromUnits({
      field: [
        { unit: dead('dead-1'), anchor: coord('player', 0, 0) },
        { unit: makeUnit({ id: 'alive', side: 'player' }), anchor: coord('player', 0, 1) },
      ],
    }, { phase: 'placement' });

    expect(canBeginCombat(state)).toBe(true);
  });

  it('ignores living ENEMY field units', () => {
    const state = makeBattleStateFromUnits({
      field: [
        { unit: dead('dead-1'), anchor: coord('player', 0, 0) },
        { unit: makeUnit({ id: 'enemy-1', side: 'enemy' }), anchor: coord('enemy', 0, 0) },
      ],
    }, { phase: 'placement' });

    expect(canBeginCombat(state)).toBe(false);
  });

  it('is false outside the placement phase', () => {
    const state = makeBattleStateFromUnits({
      field: [{ unit: makeUnit({ id: 'alive', side: 'player' }), anchor: coord('player', 0, 0) }],
    }, { phase: 'select_target' });

    expect(canBeginCombat(state)).toBe(false);
  });
});

describe('battle_begin_combat enforcement', () => {
  it('is a no-op when only dead player units hold the field', () => {
    const state = makeBattleStateFromUnits({
      field: [{ unit: dead('dead-1'), anchor: coord('player', 0, 0) }],
      bench: [{ unit: makeUnit({ id: 'benched', side: 'player' }), slot: 0 }],
      benchSlotCount: 3,
    }, { phase: 'placement' });

    const result = applyBattleLifecycleAction({ state, action: { type: 'battle_begin_combat' } });

    // The handler validates independently of any UI control state.
    expect(result.state).toBe(state);
    expect(result.state.phase).toBe('placement');
    expect(result.resetTurnContext).toBeUndefined();
    expect(result.persistCampaignPlacements).toBeUndefined();
  });

  it('starts combat with a living player field unit', () => {
    const state = makeBattleStateFromUnits({
      field: [
        { unit: makeUnit({ id: 'alive', side: 'player' }), anchor: coord('player', 0, 0) },
        { unit: dead('dead-1'), anchor: coord('player', 0, 1) },
      ],
    }, { phase: 'placement' });

    const result = applyBattleLifecycleAction({ state, action: { type: 'battle_begin_combat' } });

    expect(result.state.phase).toBe('select_target');
    expect(result.resetTurnContext).toBe(true);
    // The queue is built from living field units only.
    expect(result.state.roundQueue).toEqual(['alive']);
  });

  it('is still a no-op outside the placement phase', () => {
    const state = makeBattleStateFromUnits({
      field: [{ unit: makeUnit({ id: 'alive', side: 'player' }), anchor: coord('player', 0, 0) }],
    }, { phase: 'select_target' });

    const result = applyBattleLifecycleAction({ state, action: { type: 'battle_begin_combat' } });
    expect(result.state).toBe(state);
  });
});
