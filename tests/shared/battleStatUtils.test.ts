import { describe, it, expect } from 'vitest';
import { UNIT_BATTLE_STAT_KEYS } from '../../src/shared/unitTypes';
import {
  createZeroBattleStatMap,
  normalizeBattleStatDelta,
  addBattleStatDelta,
  sumBattleStatDeltas,
} from '../../src/shared/battleStatUtils';

describe('createZeroBattleStatMap', () => {
  it('returns all eight canonical keys, each zero', () => {
    const map = createZeroBattleStatMap();
    for (const key of UNIT_BATTLE_STAT_KEYS) expect(map[key]).toBe(0);
    expect(Object.keys(map).sort()).toEqual([...UNIT_BATTLE_STAT_KEYS].sort());
  });
});

describe('normalizeBattleStatDelta', () => {
  it('defaults missing keys to zero and keeps provided keys, including dodge/block/initiative', () => {
    const result = normalizeBattleStatDelta({ hp: 5, dodge: 2 });
    expect(result).toEqual({
      hp: 5, physicalStrength: 0, magicalStrength: 0, physicalDefense: 0, magicalDefense: 0,
      dodge: 2, block: 0, initiative: 0,
    });
  });

  it('returns an all-zero map for an empty delta', () => {
    expect(normalizeBattleStatDelta({})).toEqual(createZeroBattleStatMap());
  });
});

describe('addBattleStatDelta', () => {
  it('adds every canonical stat, including dodge/block/initiative', () => {
    const base = {
      hp: 100, physicalStrength: 10, magicalStrength: 10, physicalDefense: 5, magicalDefense: 5,
      dodge: 5, block: 5, initiative: 5,
    };
    const result = addBattleStatDelta(base, { hp: 3, dodge: 1, block: 2, initiative: 4 });
    expect(result).toEqual({
      hp: 103, physicalStrength: 10, magicalStrength: 10, physicalDefense: 5, magicalDefense: 5,
      dodge: 6, block: 7, initiative: 9,
    });
  });

  it('missing delta keys add zero', () => {
    const base = createZeroBattleStatMap();
    expect(addBattleStatDelta(base, {})).toEqual(base);
  });
});

describe('sumBattleStatDeltas', () => {
  it('sums multiple deltas, including overlapping keys', () => {
    const result = sumBattleStatDeltas([
      { hp: 5, dodge: 1 },
      { hp: 3, block: 2 },
      { initiative: 4 },
    ]);
    expect(result).toEqual({
      hp: 8, physicalStrength: 0, magicalStrength: 0, physicalDefense: 0, magicalDefense: 0,
      dodge: 1, block: 2, initiative: 4,
    });
  });

  it('returns an all-zero map for no deltas', () => {
    expect(sumBattleStatDeltas([])).toEqual(createZeroBattleStatMap());
  });
});
