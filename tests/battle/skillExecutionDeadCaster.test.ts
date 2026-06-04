import { describe, it, expect, beforeEach } from 'vitest';
import { executeSkillUse } from '../../src/battle/skillExecution';
import { killUnit, isDead, isAlive } from '../../src/battle/lifeState';
import { buildOccupancy } from '../../src/battle/occupancy';
import type { BattleState } from '../../src/battle/types';
import type { ActionSkillDefinition } from '../../src/shared/skillDefinitionTypes';
import { makeUnit, resetUnitIdCounter } from './helpers/units';
import { makeBattleStateFromUnits } from './helpers/battleState';
import { coord } from './helpers/coords';
import { fixedRng } from './helpers/rng';
import { testStrike } from './helpers/skills';

function setDead(state: BattleState, id: string): BattleState {
  const u = state.units.get(id)!;
  const units = new Map(state.units);
  units.set(id, killUnit(u));
  return { ...state, units, occupancy: buildOccupancy(units, state.deployments) };
}

const testHeal: ActionSkillDefinition = {
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

beforeEach(() => resetUnitIdCounter());

describe('executeSkillUse — dead caster safety', () => {
  for (const side of ['player', 'enemy'] as const) {
    const otherSide = side === 'player' ? 'enemy' : 'player';
    it(`dead ${side} caster produces no events and does not mutate state`, () => {
      const caster = makeUnit({ id: 'caster', side, skills: [testStrike] });
      const target = makeUnit({ id: 'target', side: otherSide });
      let state = makeBattleStateFromUnits({
        field: [
          { unit: caster, anchor: coord(side,      0, 0) },
          { unit: target, anchor: coord(otherSide, 0, 0) },
        ],
      });
      state = setDead(state, 'caster');

      const result = executeSkillUse({
        state,
        casterId: 'caster',
        target: coord(otherSide, 0, 0),
        skill: testStrike,
        queueContext: { chargedThisRound: new Set() },
        rng: fixedRng(0.99),
      });

      expect(result.events).toEqual([]);
      expect(result.state).toBe(state);
    });
  }
});

describe('executeSkillUse — dead provoked unit cannot counter-attack', () => {
  const provokeStrike: ActionSkillDefinition = {
    id: 'test_provoke_strike',
    name: 'Test Provoke Strike',
    targetPolicy: { type: 'enemy_melee' },
    actions: [
      // Non-lethal damage so the provoked target survives the initial hit;
      // then we kill it externally before counter-attack would dispatch.
      {
        type: 'damage',
        powerSource: 'physical_strength',
        matrix: { kind: 'multiplier_matrix', matrixName: 'single', level: 1 },
      },
      {
        type: 'probability_effect',
        probabilityEffectType: 'provoke',
        displayName: 'Provoke',
        matrix: { kind: 'probability_matrix', matrixName: 'single', level: 1 },
      },
    ],
  };

  it('an already-dead enemy is not provoked and no counter-attack runs', () => {
    const caster = makeUnit({ id: 'caster', side: 'player', physicalStrength: 1, skills: [provokeStrike] });
    const deadEnemy = makeUnit({
      id: 'deadEnemy',
      side: 'enemy',
      hp: 100,
      maxHp: 100,
      skills: [testStrike],
    });
    const enemyToBlockOccupancyChange = makeUnit({ id: 'fillerEnemy', side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster,                   anchor: coord('player', 0, 0) },
        { unit: deadEnemy,                anchor: coord('enemy',  0, 0) },
        { unit: enemyToBlockOccupancyChange, anchor: coord('enemy', 0, 1) },
      ],
    });
    state = setDead(state, 'deadEnemy');
    state = { ...state, roundQueue: ['caster', 'fillerEnemy'] };

    const result = executeSkillUse({
      state,
      casterId: 'caster',
      target: coord('enemy', 0, 0),
      skill: provokeStrike,
      queueContext: { chargedThisRound: new Set() },
      rng: fixedRng(0), // would always succeed probability rolls
    });

    // Dead unit is invisible to combat helpers: no damage, no probability event,
    // and definitely no counter-attack — the corpse cannot be provoked.
    expect(result.events.find(e => e.type === 'probability_effect_applied')).toBeUndefined();
    expect(result.events.find(e => e.type === 'counter_attack_start')).toBeUndefined();
    expect(result.events.find(e => e.type === 'counter_attack_unavailable')).toBeUndefined();
  });
});

describe('executeSkillUse — ordinary heal does not revive', () => {
  it('heal targeting a dead ally cell does not revive the unit', () => {
    const healer   = makeUnit({ id: 'healer',   side: 'player', skills: [testHeal] });
    const deadAlly = makeUnit({ id: 'deadAlly', side: 'player', hp: 50, maxHp: 100 });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: healer,   anchor: coord('player', 0, 0) },
        { unit: deadAlly, anchor: coord('player', 0, 1) },
      ],
    });
    state = setDead(state, 'deadAlly');

    const before = state.units.get('deadAlly')!;
    expect(isDead(before)).toBe(true);
    expect(before.hp).toBe(0);

    const result = executeSkillUse({
      state,
      casterId: 'healer',
      target: coord('player', 0, 1),
      skill: testHeal,
      queueContext: { chargedThisRound: new Set() },
      rng: fixedRng(0.99),
    });

    const after = result.state.units.get('deadAlly')!;
    expect(isDead(after)).toBe(true);
    expect(isAlive(after)).toBe(false);
    expect(after.hp).toBe(0);
    // Combat helpers silently skip dead targets — no heal event emitted for the corpse.
    const healEvents = result.events.filter(e => e.type === 'skill_heal');
    expect(healEvents).toEqual([]);
  });
});
