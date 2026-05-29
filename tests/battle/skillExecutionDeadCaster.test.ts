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
  targetPolicy: { type: 'friendly' },
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
  it('dead caster produces no events and does not mutate state', () => {
    const caster = makeUnit({ id: 'caster', side: 'player', skills: [testStrike] });
    const target = makeUnit({ id: 'target', side: 'enemy' });
    let state = makeBattleStateFromUnits({
      field: [
        { unit: caster, anchor: coord('player', 0, 0) },
        { unit: target, anchor: coord('enemy',  0, 0) },
      ],
    });
    state = setDead(state, 'caster');

    const result = executeSkillUse({
      state,
      casterId: 'caster',
      target: coord('enemy', 0, 0),
      skill: testStrike,
      queueContext: { chargedThisRound: new Set() },
      rng: fixedRng(0.99),
    });

    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
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
