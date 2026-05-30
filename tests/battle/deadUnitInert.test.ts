import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveAttack,
  resolveHealWithEvents,
  applyEffectApplication,
  applyPeriodicHpEffectApplication,
  resolveProbabilityEffects,
  tickEffects,
  checkGameOver,
} from '../../src/battle/combat';
import { buildOccupancy } from '../../src/battle/occupancy';
import {
  getLivingFieldUnits,
  getDeadFieldUnits,
} from '../../src/battle/deployment';
import { killUnit } from '../../src/battle/lifeState';
import type { BattleState, Effect, ResolvedHitCell, SkillPattern } from '../../src/battle/types';
import { makeUnit, resetUnitIdCounter } from './helpers/units';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { coord } from './helpers/coords';
import { fixedRng } from './helpers/rng';

function withDead(state: BattleState, id: string): BattleState {
  const u = state.units.get(id)!;
  const units = new Map(state.units);
  units.set(id, killUnit(u));
  return { ...state, units, occupancy: buildOccupancy(units, state.deployments) };
}

const SINGLE_CELL_PATTERN: SkillPattern = {
  anchorRow: 0,
  anchorCol: 0,
  cells: [[{ multiplier: 1 }]],
};

beforeEach(() => resetUnitIdCounter());

// Each test runs once for a player victim and once for an enemy victim, so
// living-only contracts are validated symmetrically.
const SIDES = ['player', 'enemy'] as const;

describe('ordinary combat helpers skip dead targets', () => {
  for (const side of SIDES) {
    describe(`${side} dead target`, () => {
      function setup() {
        const dead = makeUnit({ id: 'dead', side });
        let state = makeBattleStateFromUnits({
          field: [{ unit: dead, anchor: coord(side, 0, 0) }],
        });
        state = withDead(state, 'dead');
        return state;
      }

      it('resolveAttack against a dead target emits no hit event and no HP change', () => {
        const state = setup();
        const hpBefore = state.units.get('dead')!.hp;
        const { state: after, events } = resolveAttack(
          [{ coord: coord(side, 0, 0), multiplier: 1 }],
          50,
          'physical_strength',
          state,
          { rng: fixedRng(0.99) },
        );
        expect(events).toEqual([]);
        expect(after.units.get('dead')!.hp).toBe(hpBefore);
      });

      it('resolveHealWithEvents does not revive or heal a dead target', () => {
        const state = setup();
        const { state: after, heals } = resolveHealWithEvents(
          [{ coord: coord(side, 0, 0), multiplier: 1 }],
          50,
          state,
        );
        expect(heals).toEqual([]);
        expect(after.units.get('dead')!.lifeState).toBe('dead');
        expect(after.units.get('dead')!.hp).toBe(0);
      });

      it('applyEffectApplication does not attach a stat effect to a dead unit', () => {
        const state = setup();
        const effect = { id: 'buff', durationKind: 'rounds', physicalStrengthBonus: 5 } as unknown as Effect;
        const { state: after, events } = applyEffectApplication(
          { displayName: 'buff', duration: 3 },
          SINGLE_CELL_PATTERN,
          coord(side, 0, 0),
          state,
          effect,
        );
        expect(events).toEqual([]);
        expect(after.units.get('dead')!.activeEffects).toEqual([]);
      });

      it('applyPeriodicHpEffectApplication does not attach to a dead unit', () => {
        const state = setup();
        const { state: after, events } = applyPeriodicHpEffectApplication(
          { displayName: 'poison', duration: 3 },
          SINGLE_CELL_PATTERN,
          coord(side, 0, 0),
          state,
          { id: 'poison', durationKind: 'rounds' } as unknown as Effect,
          { direction: 'damage', basePower: 10 },
        );
        expect(events).toEqual([]);
        expect(after.units.get('dead')!.activeEffects).toEqual([]);
      });

      it('resolveProbabilityEffects does not provoke or distract a dead unit', () => {
        const state = setup();
        const result = resolveProbabilityEffects(
          { effect: 'provoke', displayName: 'provoke' } as any,
          SINGLE_CELL_PATTERN,
          coord(side, 0, 0),
          state,
          ['someActor', 'dead'], // dead would be eligible by index if it weren't dead
          fixedRng(0), // always succeed roll
        );
        expect(result.events).toEqual([]);
        expect(result.provokedUnitIds).toEqual([]);
        expect(result.distractedUnitIds).toEqual([]);
      });

      it('tickEffects skips a dead unit and emits no events for it', () => {
        // Start with a living unit holding a periodic effect, then kill it.
        // killUnit clears activeEffects, so this verifies the precondition;
        // we additionally place a dead unit with synthetic activeEffects to
        // confirm tickEffects refuses to advance them.
        const undead = makeUnit({
          id: 'dead',
          side,
          lifeState: 'dead',
          hp: 0,
          // Intentionally malformed: dead unit with effects. tickEffects must
          // still ignore it; if it processed effects, this would emit events.
          activeEffects: [{
            effectDisplayName: 'poison',
            effect: { id: 'poison', durationKind: 'rounds' } as unknown as Effect,
            remainingRounds: 1,
            periodicHp: { direction: 'damage', amountPerTurn: 5 },
          }],
        });
        const state = makeBattleStateFromUnits({
          field: [{ unit: undead, anchor: coord(side, 0, 0) }],
        });

        const { state: after, events } = tickEffects(state);
        expect(events.filter(e => e.unitId === 'dead')).toEqual([]);
        expect(after.units.get('dead')!.hp).toBe(0);
      });
    });
  }
});

describe('dead enemy field unit remains a runtime entity', () => {
  function setupDeadEnemy() {
    const dead = makeUnit({ id: 'corpse', side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [{ unit: dead, anchor: coord('enemy', 0, 0) }],
    });
    state = withDead(state, 'corpse');
    return state;
  }

  it('stays in state.units after lethal damage', () => {
    expect(setupDeadEnemy().units.has('corpse')).toBe(true);
  });

  it('keeps its deployment entry', () => {
    expect(setupDeadEnemy().deployments.has('corpse')).toBe(true);
  });

  it('does not block occupancy cells (living-only blocking)', () => {
    const state = setupDeadEnemy();
    expect(state.occupancy.unitToCells.has('corpse')).toBe(false);
  });

  it('is excluded from getLivingFieldUnits and included in getDeadFieldUnits', () => {
    const state = setupDeadEnemy();
    expect(getLivingFieldUnits(state).map(u => u.id)).not.toContain('corpse');
    expect(getDeadFieldUnits(state).map(u => u.id)).toEqual(['corpse']);
  });

  it('checkGameOver returns "enemy" (the losing side) when the only enemy is dead, ignoring presence in state.units', () => {
    const player = makeUnit({ id: 'p', side: 'player' });
    const enemy  = makeUnit({ id: 'e', side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: player, anchor: coord('player', 0, 0) },
        { unit: enemy,  anchor: coord('enemy',  0, 0) },
      ],
    });
    state = withDead(state, 'e');
    // Sanity: dead enemy entity is still present in state.units — checkGameOver
    // must look at living field units, not entity existence.
    expect(state.units.has('e')).toBe(true);
    // Per the existing contract (see deathSemantics.test.ts), the returned side
    // is the loser — i.e. the side with no living field units.
    expect(checkGameOver(state)).toBe('enemy');
  });
});
