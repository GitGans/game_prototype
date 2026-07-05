import type { UnitBattleStats, UnitProgressionStatModifiers } from '../../shared/unitTypes';
import type { PartialBattleStatBonuses } from '../../shared/itemTypes';
import { addBattleStatDelta } from '../../shared/battleStatUtils';

/** Adds progression upgrade modifiers. Affects every canonical battle stat. */
export function addUpgradeModifiers(
  stats: UnitBattleStats,
  modifiers: UnitProgressionStatModifiers,
): UnitBattleStats {
  return addBattleStatDelta(stats, modifiers);
}

/**
 * Adds equipment OR permanent bonuses. Affects every canonical battle stat,
 * including dodge/block/initiative — previously excluded here; that
 * exclusion was the bug this refactor fixes.
 */
export function addBattleStatBonuses(
  stats: UnitBattleStats,
  bonuses: PartialBattleStatBonuses,
): UnitBattleStats {
  return addBattleStatDelta(stats, bonuses);
}
