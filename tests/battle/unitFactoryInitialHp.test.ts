import { describe, it, expect } from 'vitest';
import { createUnitInstance, type CreateUnitInstanceInput } from '../../src/battle/unitFactory';
import { ucid } from '../../src/shared/unitTypes';
import type { UnitBlueprint } from '../../src/shared/unitTypes';

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

function makeInput(initialHp?: number): CreateUnitInstanceInput {
  return {
    blueprint:            makeBlueprint(),
    id:                   'u1',
    side:                 'player',
    level:                1,
    classId:              ucid('warrior'),
    stats:                { hp: 30, physicalStrength: 10, magicalStrength: 0, physicalDefense: 0, magicalDefense: 0, dodge: 0, block: 0, initiative: 10 },
    skills:               [],
    spriteSheet:          undefined,
    activatableAbilities: [],
    initialHp,
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

  it('lifeState is always alive regardless of initialHp', () => {
    expect(createUnitInstance(makeInput(1)).lifeState).toBe('alive');
    expect(createUnitInstance(makeInput(30)).lifeState).toBe('alive');
  });
});
