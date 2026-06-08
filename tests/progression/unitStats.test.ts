import { describe, it, expect } from 'vitest';
import type { UnitBlueprint } from '../../src/shared/unitTypes';
import {
  computeUnitBaseStatsForLevel,
  resolveUnitBattleStats,
} from '../../src/progression/stats';

const bp = {
  templateId: 'test',
  hp: 100, physicalStrength: 50, magicalStrength: 30,
  physicalDefense: 10, magicalDefense: 8,
  dodge: 5, block: 4, initiative: 7,
} as unknown as UnitBlueprint;

describe('computeUnitBaseStatsForLevel', () => {
  it('level 1 returns blueprint values', () => {
    expect(computeUnitBaseStatsForLevel(bp, 1)).toEqual({
      hp: 100, physicalStrength: 50, magicalStrength: 30,
      physicalDefense: 10, magicalDefense: 8, dodge: 5, block: 4, initiative: 7,
    });
  });

  it('level 3 applies 1.2x to hp/physStr/magStr only', () => {
    const s = computeUnitBaseStatsForLevel(bp, 3);
    expect(s.hp).toBe(120);
    expect(s.physicalStrength).toBe(60);
    expect(s.magicalStrength).toBe(36);
    expect(s.physicalDefense).toBe(10);
    expect(s.magicalDefense).toBe(8);
    expect(s.dodge).toBe(5);
    expect(s.block).toBe(4);
    expect(s.initiative).toBe(7);
  });

  it('uses Math.round on scaled stats', () => {
    // hp 15 * 1.1 = 16.5 -> 17
    const s = computeUnitBaseStatsForLevel({ ...bp, hp: 15 } as UnitBlueprint, 2);
    expect(s.hp).toBe(17);
  });
});

describe('resolveUnitBattleStats', () => {
  it('no bonuses == base (enemy path)', () => {
    expect(resolveUnitBattleStats({ blueprint: bp, level: 3 }))
      .toEqual(computeUnitBaseStatsForLevel(bp, 3));
  });

  it('upgrade modifiers apply after level scaling and reach all 8 stats', () => {
    const s = resolveUnitBattleStats({
      blueprint: bp, level: 3,
      upgradeModifiers: { hp: 10, dodge: 2, initiative: 1 },
    });
    expect(s.hp).toBe(130);        // 120 + 10
    expect(s.dodge).toBe(7);       // 5 + 2
    expect(s.initiative).toBe(8);  // 7 + 1
  });

  it('equipment & permanent bonuses apply after scaling but NOT to dodge/block/initiative', () => {
    const s = resolveUnitBattleStats({
      blueprint: bp, level: 3,
      equipmentBonuses: { hp: 5, physicalDefense: 2 },
      permanentBonuses: { hp: 3 },
    });
    expect(s.hp).toBe(128);             // 120 + 5 + 3
    expect(s.physicalDefense).toBe(12); // 10 + 2
    expect(s.dodge).toBe(5);            // untouched
    expect(s.block).toBe(4);            // untouched
    expect(s.initiative).toBe(7);       // untouched
  });

  it('golden: full combination matches legacy order base+upgrade+equipment+permanent', () => {
    const s = resolveUnitBattleStats({
      blueprint: bp, level: 3,
      upgradeModifiers: { hp: 10 },
      equipmentBonuses: { hp: 5 },
      permanentBonuses: { hp: 3 },
    });
    expect(s.hp).toBe(138); // 120 + 10 + 5 + 3
  });
});
