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

describe('computeUnitBaseStatsForLevel (hp golden, both sides of every band)', () => {
  // With hp = 100, the resulting hp directly encodes the cumulative growth percent,
  // so this table is also the band-math test (no need to expose the private helpers).
  const hpCases: Array<[number, number]> = [
    [1, 100], [2, 110], [3, 120], [4, 130], [5, 142],
    [9, 190], [10, 204], [14, 260], [15, 276], [19, 340], [20, 358],
  ];
  it.each(hpCases)('level %i => hp %i', (level, hp) => {
    expect(computeUnitBaseStatsForLevel(bp, level).hp).toBe(hp);
  });

  it('level 1 returns exact blueprint values', () => {
    expect(computeUnitBaseStatsForLevel(bp, 1)).toEqual({
      hp: 100, physicalStrength: 50, magicalStrength: 30,
      physicalDefense: 10, magicalDefense: 8, dodge: 5, block: 4, initiative: 7,
    });
  });

  it('only hp/physicalStrength/magicalStrength scale; others stay flat', () => {
    const s = computeUnitBaseStatsForLevel(bp, 10); // 2.04x
    expect(s.hp).toBe(204);
    expect(s.physicalStrength).toBe(102); // round(50 * 2.04)
    expect(s.magicalStrength).toBe(61);   // round(30 * 2.04 = 61.2)
    expect(s.physicalDefense).toBe(10);
    expect(s.magicalDefense).toBe(8);
    expect(s.dodge).toBe(5);
    expect(s.block).toBe(4);
    expect(s.initiative).toBe(7);
  });

  it('uses Math.round on scaled stats', () => {
    // hp 15 at level 2: 15 * 110 / 100 = 16.5 -> 17
    const s = computeUnitBaseStatsForLevel({ ...bp, hp: 15 } as UnitBlueprint, 2);
    expect(s.hp).toBe(17);
  });
});

describe('computeUnitBaseStatsForLevel (invalid level guard)', () => {
  it('throws on level 0', () => {
    expect(() => computeUnitBaseStatsForLevel(bp, 0)).toThrow();
  });
  it('throws on negative level', () => {
    expect(() => computeUnitBaseStatsForLevel(bp, -3)).toThrow();
  });
  it('throws on fractional level', () => {
    expect(() => computeUnitBaseStatsForLevel(bp, 2.5)).toThrow();
  });
});

describe('resolveUnitBattleStats', () => {
  it('no bonuses == base (enemy path)', () => {
    expect(resolveUnitBattleStats({ blueprint: bp, level: 5 }))
      .toEqual(computeUnitBaseStatsForLevel(bp, 5));
  });

  it('upgrade modifiers apply after level scaling and reach all 8 stats', () => {
    const s = resolveUnitBattleStats({
      blueprint: bp, level: 5, // 1.42x
      upgradeModifiers: { hp: 10, dodge: 2, initiative: 1 },
    });
    expect(s.hp).toBe(152);        // 142 + 10
    expect(s.dodge).toBe(7);       // 5 + 2 (dodge is flat at base)
    expect(s.initiative).toBe(8);  // 7 + 1
  });

  it('equipment & permanent bonuses apply after scaling', () => {
    const s = resolveUnitBattleStats({
      blueprint: bp, level: 5,
      equipmentBonuses: { hp: 5, physicalDefense: 2 },
      permanentBonuses: { hp: 3 },
    });
    expect(s.hp).toBe(150);             // 142 + 5 + 3
    expect(s.physicalDefense).toBe(12); // 10 + 2
    expect(s.dodge).toBe(5);            // no delta specified — unchanged
    expect(s.block).toBe(4);            // no delta specified — unchanged
    expect(s.initiative).toBe(7);       // no delta specified — unchanged
  });

  it('equipment & permanent bonuses affect dodge/block/initiative — previously excluded, now fixed', () => {
    const s = resolveUnitBattleStats({
      blueprint: bp, level: 5,
      equipmentBonuses: { dodge: 3 },
      permanentBonuses: { block: 2, initiative: 1 },
    });
    expect(s.dodge).toBe(8);       // 5 + 3
    expect(s.block).toBe(6);       // 4 + 2
    expect(s.initiative).toBe(8);  // 7 + 1
  });

  it('golden: full combination base+upgrade+equipment+permanent (order preserved)', () => {
    const s = resolveUnitBattleStats({
      blueprint: bp, level: 5,
      upgradeModifiers: { hp: 10 },
      equipmentBonuses: { hp: 5 },
      permanentBonuses: { hp: 3 },
    });
    expect(s.hp).toBe(160); // 142 + 10 + 5 + 3
  });
});
