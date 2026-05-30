import { describe, it, expect, beforeEach } from 'vitest';
import { executeSkillUse } from '../../src/battle/skillExecution';
import { compileSkillUsePlan } from '../../src/battle/skillPlanCompiler';
import { killUnit, isAlive, isDead } from '../../src/battle/lifeState';
import { buildOccupancy } from '../../src/battle/occupancy';
import { SHAPES } from '../../src/data/shapeDefinitions';
import type { BattleState } from '../../src/battle/types';
import type { ActionSkillDefinition } from '../../src/shared/skillDefinitionTypes';
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

const reviveSingle: ActionSkillDefinition = {
  id: 'test_revive',
  name: 'Test Revive',
  targetPolicy: { type: 'dead_friendly' },
  actions: [
    {
      type: 'revive',
      level: 1,
      matrix: { kind: 'effect_area_matrix', matrixName: 'single' },
    },
  ],
};

const reviveCross: ActionSkillDefinition = {
  id: 'test_revive_cross',
  name: 'Test Revive Cross',
  targetPolicy: { type: 'dead_friendly' },
  actions: [
    {
      type: 'revive',
      level: 2,
      matrix: { kind: 'effect_area_matrix', matrixName: 'cross' },
    },
  ],
};

beforeEach(() => resetUnitIdCounter());

describe('executeSkillUse — revive', () => {
  it('emits exactly one unit_revived event per corpse revived, with full fields', () => {
    const caster = makeUnit({ id: 'caster', name: 'Healer', side: 'player' });
    const dead   = makeUnit({ id: 'dead', name: 'Corpse', side: 'player', maxHp: 100 });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster, anchor: coord('player', 0, 0) },
        { unit: dead,   anchor: coord('player', 1, 1) },
      ],
    });
    state = setDead(state, 'dead');
    state = { ...state, roundQueue: ['caster'] };

    const result = executeSkillUse({
      state,
      casterId: 'caster',
      target: coord('player', 1, 1),
      skill: reviveSingle,
      queueContext: { chargedThisRound: new Set() },
      rng: fixedRng(0.5),
    });

    const reviveEvents = result.events.filter((e) => e.type === 'unit_revived');
    expect(reviveEvents).toHaveLength(1);
    const event = reviveEvents[0];
    expect(event).toEqual({
      type: 'unit_revived',
      casterId: 'caster',
      casterName: 'Healer',
      targetId: 'dead',
      targetName: 'Corpse',
      amount: 10,
    });
    expect(isAlive(result.state.units.get('dead')!)).toBe(true);
  });

  it('no-op on a living target', () => {
    const caster = makeUnit({ id: 'caster', side: 'player' });
    const ally   = makeUnit({ id: 'ally',   side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [
        { unit: caster, anchor: coord('player', 0, 0) },
        { unit: ally,   anchor: coord('player', 1, 1) },
      ],
    });

    const result = executeSkillUse({
      state,
      casterId: 'caster',
      target: coord('player', 1, 1),
      skill: reviveSingle,
      queueContext: { chargedThisRound: new Set() },
      rng: fixedRng(0.5),
    });

    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('no-op on a dead enemy target (wrong side)', () => {
    const caster    = makeUnit({ id: 'caster',    side: 'player' });
    const deadEnemy = makeUnit({ id: 'deadEnemy', side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,    anchor: coord('player', 0, 0) },
        { unit: deadEnemy, anchor: coord('enemy',  0, 0) },
      ],
    });
    state = setDead(state, 'deadEnemy');

    const result = executeSkillUse({
      state,
      casterId: 'caster',
      target: coord('enemy', 0, 0),
      skill: reviveSingle,
      queueContext: { chargedThisRound: new Set() },
      rng: fixedRng(0.5),
    });

    expect(result.events).toEqual([]);
    expect(isDead(result.state.units.get('deadEnemy')!)).toBe(true);
  });

  it('no-op on an empty target cell', () => {
    const caster = makeUnit({ id: 'caster', side: 'player' });
    const state = makeBattleStateFromUnits({
      field: [{ unit: caster, anchor: coord('player', 0, 0) }],
    });

    const result = executeSkillUse({
      state,
      casterId: 'caster',
      target: coord('player', 1, 1),
      skill: reviveSingle,
      queueContext: { chargedThisRound: new Set() },
      rng: fixedRng(0.5),
    });

    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('AOE matrix that covers same corpse via two cells emits exactly one event', () => {
    const caster = makeUnit({ id: 'caster', side: 'player' });
    const giant  = makeUnit({ id: 'giant',  side: 'player', maxHp: 100, shape: SHAPES['1x2'] });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster, anchor: coord('player', 1, 0) },
        { unit: giant,  anchor: coord('player', 0, 1) }, // (0,1) and (0,2)
      ],
    });
    state = setDead(state, 'giant');

    // cross anchored at (0,1) hits (0,0), (0,1), (0,2), (1,1) — corpse cells at (0,1) and (0,2).
    const result = executeSkillUse({
      state,
      casterId: 'caster',
      target: coord('player', 0, 1),
      skill: reviveCross,
      queueContext: { chargedThisRound: new Set() },
      rng: fixedRng(0.5),
    });

    const reviveEvents = result.events.filter((e) => e.type === 'unit_revived');
    expect(reviveEvents).toHaveLength(1);
    expect(reviveEvents[0]).toMatchObject({ targetId: 'giant', amount: 20 });
  });
});

describe('compileSkillUsePlan — revive', () => {
  it('maps SkillDefinitionReviveAction to runtime revive action', () => {
    const plan = compileSkillUsePlan(reviveSingle);
    expect(plan.actions.length).toBe(1);
    const action = plan.actions[0];
    expect(action.type).toBe('revive');
    if (action.type !== 'revive') throw new Error('unreachable');
    expect(action.revive.level).toBe(1);
    expect(action.matrix.kind).toBe('effect_area_matrix');
    expect(action.matrix.matrixName).toBe('single');
  });

  it('preserves higher levels', () => {
    const plan = compileSkillUsePlan(reviveCross);
    const action = plan.actions[0];
    if (action.type !== 'revive') throw new Error('unreachable');
    expect(action.revive.level).toBe(2);
    expect(action.matrix.matrixName).toBe('cross');
  });

  it('throws when revive action is paired with alive_friendly target policy', () => {
    const bad: ActionSkillDefinition = {
      ...reviveSingle,
      targetPolicy: { type: 'alive_friendly' },
    };
    expect(() => compileSkillUsePlan(bad)).toThrow(/dead_friendly/);
    expect(() => compileSkillUsePlan(bad)).toThrow(/test_revive/);
  });

  it('throws when revive action is paired with self target policy', () => {
    const bad: ActionSkillDefinition = {
      ...reviveSingle,
      targetPolicy: { type: 'self' },
    };
    expect(() => compileSkillUsePlan(bad)).toThrow(/dead_friendly/);
  });

  it('throws when revive action is paired with enemy_melee target policy', () => {
    const bad: ActionSkillDefinition = {
      ...reviveSingle,
      targetPolicy: { type: 'enemy_melee' },
    };
    expect(() => compileSkillUsePlan(bad)).toThrow(/dead_friendly/);
  });

  it('throws when revive action is paired with enemy_ranged target policy', () => {
    const bad: ActionSkillDefinition = {
      ...reviveSingle,
      targetPolicy: { type: 'enemy_ranged' },
    };
    expect(() => compileSkillUsePlan(bad)).toThrow(/dead_friendly/);
  });

  it('accepts revive + dead_friendly without throwing', () => {
    expect(() => compileSkillUsePlan(reviveSingle)).not.toThrow();
  });

  it('accepts a mix of heal and revive actions when targetPolicy is dead_friendly', () => {
    const mixed: ActionSkillDefinition = {
      id: 'test_heal_and_revive',
      name: 'Heal And Revive',
      targetPolicy: { type: 'dead_friendly' },
      actions: [
        {
          type: 'heal',
          powerSource: 'magical_strength',
          matrix: { kind: 'multiplier_matrix', matrixName: 'single', level: 1 },
        },
        {
          type: 'revive',
          level: 1,
          matrix: { kind: 'effect_area_matrix', matrixName: 'single' },
        },
      ],
    };
    expect(() => compileSkillUsePlan(mixed)).not.toThrow();
  });
});

describe('executeSkillUse — revive level validation', () => {
  it('handmade revive skill with invalid level throws during execution', () => {
    const badLevel: ActionSkillDefinition = {
      id: 'test_revive_bad',
      name: 'Bad Revive',
      targetPolicy: { type: 'dead_friendly' },
      actions: [
        {
          type: 'revive',
          // Cast: SkillLevel is a literal union; we want to verify the runtime throw.
          level: 0 as unknown as 1,
          matrix: { kind: 'effect_area_matrix', matrixName: 'single' },
        },
      ],
    };

    const caster = makeUnit({ id: 'caster', side: 'player' });
    const dead   = makeUnit({ id: 'dead',   side: 'player' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster, anchor: coord('player', 0, 0) },
        { unit: dead,   anchor: coord('player', 1, 1) },
      ],
    });
    state = setDead(state, 'dead');

    expect(() => executeSkillUse({
      state,
      casterId: 'caster',
      target: coord('player', 1, 1),
      skill: badLevel,
      queueContext: { chargedThisRound: new Set() },
      rng: fixedRng(0.5),
    })).toThrow(/revive/);
  });
});

describe('executeSkillUse — ordinary heal does not revive (regression)', () => {
  it('heal action on dead unit emits nothing and leaves the corpse dead', () => {
    const healSkill: ActionSkillDefinition = {
      id: 'test_heal',
      name: 'Test Heal',
      targetPolicy: { type: 'alive_friendly' },
      actions: [
        {
          type: 'heal',
          powerSource: 'magical_strength',
          matrix: { kind: 'multiplier_matrix', matrixName: 'single', level: 1 },
        },
      ],
    };

    const healer = makeUnit({ id: 'healer', side: 'player' });
    const dead   = makeUnit({ id: 'dead',   side: 'player', maxHp: 100 });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: healer, anchor: coord('player', 0, 0) },
        { unit: dead,   anchor: coord('player', 1, 1) },
      ],
    });
    state = setDead(state, 'dead');

    const result = executeSkillUse({
      state,
      casterId: 'healer',
      target: coord('player', 1, 1),
      skill: healSkill,
      queueContext: { chargedThisRound: new Set() },
      rng: fixedRng(0.5),
    });

    expect(result.events.find((e) => e.type === 'unit_revived')).toBeUndefined();
    expect(isDead(result.state.units.get('dead')!)).toBe(true);
  });
});
