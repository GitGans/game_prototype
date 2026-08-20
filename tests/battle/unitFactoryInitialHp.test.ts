import { describe, it, expect } from 'vitest';
import { createUnitInstance, type CreateUnitInstanceInput } from '../../src/battle/unitFactory';
import { ucid } from '../../src/shared/unitTypes';
import type { UnitBlueprint, UnitLifeState } from '../../src/shared/unitTypes';

function makeBlueprint(): UnitBlueprint {
  return {
    templateId:       'test',
    name:             'Test',
    hp:               30,
    physicalStrength: 10,
    magicalStrength:  0,
    physicalDefense:  0,
    magicalDefense:   0,
    dodge:            0,
    block:            0,
    level:            1,
    initiative:       10,
    shape:            { offsets: [{ dr: 0, dc: 0 }] },
    rowTrait:         'front',
    baseClassId:      ucid('warrior'),
  };
}

const SPRITE_SHEET = {
  path: 'x.png', frameWidth: 32, frameHeight: 32,
  states: ['idle', 'attack', 'death'] as const,
};

function makeInput(initialHp?: number, initialLifeState?: UnitLifeState): CreateUnitInstanceInput {
  const stats = { hp: 30, physicalStrength: 10, magicalStrength: 0, physicalDefense: 0, magicalDefense: 0, dodge: 0, block: 0, initiative: 10 };
  return {
    blueprint:            makeBlueprint(),
    id:                   'u1',
    side:                 'player',
    level:                1,
    classId:              ucid('warrior'),
    stats,
    statHighlightBaseStats: stats,   // equal to stats (no equipment)
    skills:               [],
    spriteSheet:          { ...SPRITE_SHEET, states: [...SPRITE_SHEET.states] },
    initialHp,
    initialLifeState,
  };
}

describe('unitFactory — initialHp', () => {
  it('omitted initialHp defaults to maxHp, alive', () => {
    const u = createUnitInstance(makeInput());
    expect(u.hp).toBe(30);
    expect(u.maxHp).toBe(30);
    expect(u.lifeState).toBe('alive');
  });

  it('explicit initialHp under maxHp is used', () => {
    const u = createUnitInstance(makeInput(7));
    expect(u.hp).toBe(7);
  });

  it('initialHp 0 clamps up to 1', () => {
    const u = createUnitInstance(makeInput(0));
    expect(u.hp).toBe(1);
  });

  it('negative initialHp clamps up to 1', () => {
    const u = createUnitInstance(makeInput(-99));
    expect(u.hp).toBe(1);
  });

  it('initialHp above maxHp clamps down to maxHp', () => {
    const u = createUnitInstance(makeInput(9999));
    expect(u.hp).toBe(30);
  });

  it('lifeState defaults to alive regardless of initialHp', () => {
    expect(createUnitInstance(makeInput(1)).lifeState).toBe('alive');
    expect(createUnitInstance(makeInput(30)).lifeState).toBe('alive');
  });
});

describe('unitFactory — initialLifeState', () => {
  it('omitted initialLifeState creates a living unit', () => {
    const u = createUnitInstance(makeInput());
    expect(u.lifeState).toBe('alive');
    expect(u.hp).toBe(30);
  });

  it('explicit alive still clamps HP to 1..maxHp', () => {
    expect(createUnitInstance(makeInput(0, 'alive')).hp).toBe(1);
    expect(createUnitInstance(makeInput(9999, 'alive')).hp).toBe(30);
  });

  it('dead input produces the canonical dead state', () => {
    const u = createUnitInstance(makeInput(undefined, 'dead'));
    expect(u.lifeState).toBe('dead');
    expect(u.hp).toBe(0);
    expect(u.activeEffects).toEqual([]);
  });

  it('dead input ignores a positive initialHp', () => {
    const u = createUnitInstance(makeInput(25, 'dead'));
    expect(u.lifeState).toBe('dead');
    expect(u.hp).toBe(0);
  });

  it('a dead unit retains every other resolved field', () => {
    const alive = createUnitInstance(makeInput(undefined, 'alive'));
    const dead  = createUnitInstance(makeInput(undefined, 'dead'));

    // Only hp and lifeState may differ.
    expect({ ...dead, hp: alive.hp, lifeState: alive.lifeState }).toEqual(alive);
    expect(dead.maxHp).toBe(30);
    expect(dead.spriteSheet).toEqual(alive.spriteSheet);
    expect(dead.shape).toEqual(alive.shape);
    expect(dead.classId).toBe(alive.classId);
    expect(dead.statHighlightBaseStats).toEqual(alive.statHighlightBaseStats);
  });
});
