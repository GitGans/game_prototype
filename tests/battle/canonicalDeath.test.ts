import { describe, it, expect, beforeEach } from 'vitest';
import { resolveAttack, tickEffects, applyPeriodicHpEffectApplication } from '../../src/battle/combat';
import { executeSkillUse } from '../../src/battle/skillExecution';
import type { ActionSkillDefinition } from '../../src/shared/skillDefinitionTypes';
import type { Effect, ResolvedHitCell } from '../../src/battle/types';
import { makeUnit, resetUnitIdCounter } from './helpers/units';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { coord } from './helpers/coords';
import { fixedRng } from './helpers/rng';
import { testStrike } from './helpers/skills';
import { expectCanonicallyDead, expectNoHalfDeadUnits } from './helpers/deathAssertions';

beforeEach(() => resetUnitIdCounter());

describe('canonical death — lethal resolveAttack', () => {
  for (const side of ['player', 'enemy'] as const) {
    it(`${side} victim: lethal hit produces canonical dead shape`, () => {
      const victim = makeUnit({
        id: 'victim',
        side,
        hp: 5,
        maxHp: 30,
        dodge: 0,
        block: 0,
        activeEffects: [{
          effectDisplayName: 'buff',
          effect: { id: 'buff', durationKind: 'rounds', physicalStrengthBonus: 3 } as unknown as Effect,
          remainingRounds: 4,
        }],
      });
      const state = makeBattleStateFromUnits({
        field: [{ unit: victim, anchor: coord(side, 0, 0) }],
      });
      const hitCells: ResolvedHitCell[] = [
        { coord: coord(side, 0, 0), multiplier: 1.0 },
      ];

      const { state: after } = resolveAttack(
        hitCells,
        100,
        'physical_strength',
        state,
        { rng: fixedRng(0.99) },
      );

      expectCanonicallyDead(after, 'victim');
      expectNoHalfDeadUnits(after);
    });
  }
});

describe('canonical death — lethal tickEffects', () => {
  for (const side of ['player', 'enemy'] as const) {
    it(`${side} victim: periodic damage tick that drops hp to 0 produces canonical dead shape`, () => {
      const victim = makeUnit({
        id: 'victim',
        side,
        hp: 5,
        maxHp: 30,
        activeEffects: [
          {
            effectDisplayName: 'poison',
            effect: { id: 'poison', durationKind: 'rounds' } as unknown as Effect,
            remainingRounds: 3,
            periodicHp: { direction: 'damage', amountPerTurn: 10 },
          },
          {
            // Second effect: tickEffects should NOT emit further events for this
            // unit after the lethal tick because killUnit clears activeEffects.
            effectDisplayName: 'curse',
            effect: { id: 'curse', durationKind: 'rounds' } as unknown as Effect,
            remainingRounds: 1,
            periodicHp: { direction: 'damage', amountPerTurn: 1 },
          },
        ],
      });
      const state = makeBattleStateFromUnits({
        field: [{ unit: victim, anchor: coord(side, 0, 0) }],
      });

      const { state: after, events } = tickEffects(state);

      expectCanonicallyDead(after, 'victim');
      expectNoHalfDeadUnits(after);

      // The lethal tick event is emitted, but no further tick/expiry events
      // fire for this victim after death (killUnit clears effects).
      const victimEvents = events.filter(e => e.unitId === 'victim');
      const lethalTicks = victimEvents.filter(e => e.type === 'effect_tick_damage');
      expect(lethalTicks).toHaveLength(1); // only the poison tick that killed
      expect(victimEvents.find(e => e.type === 'effect_expired')).toBeUndefined();
    });
  }
});

describe('canonical death — lethal skill execution', () => {
  for (const side of ['player', 'enemy'] as const) {
    const otherSide = side === 'player' ? 'enemy' : 'player';
    it(`${side} caster killing an ${otherSide} produces canonical dead shape via skill path`, () => {
      const caster = makeUnit({
        id: 'caster',
        side,
        physicalStrength: 100,
        skills: [testStrike],
      });
      const victim = makeUnit({
        id: 'victim',
        side: otherSide,
        hp: 1,
        maxHp: 30,
        dodge: 0,
        block: 0,
      });
      const state = makeBattleStateFromUnits({
        field: [
          { unit: caster, anchor: coord(side, 0, 0) },
          { unit: victim, anchor: coord(otherSide, 0, 0) },
        ],
      });

      const result = executeSkillUse({
        state,
        casterId: 'caster',
        target: coord(otherSide, 0, 0),
        skill: testStrike,
        queueContext: { chargedThisRound: new Set() },
        rng: fixedRng(0.99),
      });

      expectCanonicallyDead(result.state, 'victim');
      expectNoHalfDeadUnits(result.state);
    });
  }
});

describe('canonical death — no half-dead production output', () => {
  it('after a representative sequence (skill kill + periodic tick kill), every unit is canonical', () => {
    const caster = makeUnit({ id: 'caster', side: 'player', physicalStrength: 100, skills: [testStrike] });
    const target = makeUnit({ id: 'target', side: 'enemy', hp: 1, maxHp: 30, dodge: 0, block: 0 });
    const poisoned = makeUnit({
      id: 'poisoned',
      side: 'enemy',
      hp: 3,
      maxHp: 30,
      activeEffects: [{
        effectDisplayName: 'poison',
        effect: { id: 'poison', durationKind: 'rounds' } as unknown as Effect,
        remainingRounds: 2,
        periodicHp: { direction: 'damage', amountPerTurn: 5 },
      }],
    });
    const bystander = makeUnit({ id: 'bystander', side: 'player', hp: 25, maxHp: 30 });

    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,    anchor: coord('player', 0, 0) },
        { unit: bystander, anchor: coord('player', 0, 1) },
        { unit: target,    anchor: coord('enemy',  0, 0) },
        { unit: poisoned,  anchor: coord('enemy',  0, 1) },
      ],
    });

    const skillResult = executeSkillUse({
      state,
      casterId: 'caster',
      target: coord('enemy', 0, 0),
      skill: testStrike,
      queueContext: { chargedThisRound: new Set() },
      rng: fixedRng(0.99),
    });
    state = skillResult.state;

    const tickResult = tickEffects(state);
    state = tickResult.state;

    expectCanonicallyDead(state, 'target');
    expectCanonicallyDead(state, 'poisoned');
    expectNoHalfDeadUnits(state);
  });
});

describe('canonical death — applyPeriodicHpEffectApplication does not attach to corpses', () => {
  it('lethal periodic effect that lands on an already-dead unit attaches nothing', () => {
    // Set up a dead enemy; apply a periodic damage effect to their cell.
    const dead = makeUnit({
      id: 'corpse',
      side: 'enemy',
      lifeState: 'dead',
      hp: 0,
      activeEffects: [],
    });
    const state = makeBattleStateFromUnits({
      field: [{ unit: dead, anchor: coord('enemy', 0, 0) }],
    });

    const result = applyPeriodicHpEffectApplication(
      { displayName: 'late_poison', duration: 3 },
      { anchorRow: 0, anchorCol: 0, cells: [[{ multiplier: 1 }]] },
      coord('enemy', 0, 0),
      state,
      { id: 'late_poison', durationKind: 'rounds' } as unknown as Effect,
      { direction: 'damage', basePower: 10 },
    );

    expect(result.events).toEqual([]);
    expect(result.state.units.get('corpse')?.activeEffects).toEqual([]);
    expectNoHalfDeadUnits(result.state);
  });
});
