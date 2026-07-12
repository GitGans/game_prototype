import { UNIT_BATTLE_STAT_KEYS, type UnitBattleStatMap, type UnitBattleStats, type UnitBattleStatDelta } from './unitTypes';

export function createZeroBattleStatMap(): UnitBattleStatMap {
  const result = {} as UnitBattleStatMap;
  for (const key of UNIT_BATTLE_STAT_KEYS) result[key] = 0;
  return result;
}

/** Normalizes a sparse delta into a full map, defaulting missing keys to 0. */
export function normalizeBattleStatDelta(delta: UnitBattleStatDelta): UnitBattleStatMap {
  const result = createZeroBattleStatMap();
  for (const key of UNIT_BATTLE_STAT_KEYS) {
    if (delta[key] !== undefined) result[key] = delta[key]!;
  }
  return result;
}

/** Adds a sparse delta onto a full stat object. Missing delta keys add 0. */
export function addBattleStatDelta(stats: UnitBattleStats, delta: UnitBattleStatDelta): UnitBattleStats {
  const result = { ...stats };
  for (const key of UNIT_BATTLE_STAT_KEYS) {
    result[key] = stats[key] + (delta[key] ?? 0);
  }
  return result;
}

/** Sums any number of sparse deltas into one full map. */
export function sumBattleStatDeltas(values: readonly UnitBattleStatDelta[]): UnitBattleStatMap {
  const result = createZeroBattleStatMap();
  for (const delta of values) {
    for (const key of UNIT_BATTLE_STAT_KEYS) {
      result[key] += delta[key] ?? 0;
    }
  }
  return result;
}
