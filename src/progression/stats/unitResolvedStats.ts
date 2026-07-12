import type { UnitBlueprint, UnitBattleStats, UnitProgressionStatModifiers } from '../../shared/unitTypes';
import type { PartialBattleStatBonuses } from '../../shared/itemTypes';
import { computeUnitBaseStatsForLevel } from './unitBaseStats';
import { addUpgradeModifiers, addBattleStatBonuses } from './statBonuses';

export interface ResolveUnitBattleStatsInput {
  blueprint: UnitBlueprint;
  level: number;
  /** All optional — default to empty (no bonus) so enemies can omit them. */
  upgradeModifiers?: UnitProgressionStatModifiers;
  equipmentBonuses?: PartialBattleStatBonuses;
  permanentBonuses?: PartialBattleStatBonuses;
}

/**
 * Final unit battle stat resolver — single source of truth shared by battle setup
 * (core/battleSetupProjection) and UI snapshots (core/unitStatsSnapshot).
 *
 * Combination order (identical to legacy computeUnitBattleStats):
 *   base(blueprint, level) + upgradeModifiers + equipmentBonuses + permanentBonuses
 *
 * Does NOT read item containers/instances/definitions — equipmentBonuses must be
 * pre-computed by the caller (keeps progression free of inventory layout).
 */
export function resolveUnitBattleStats(input: ResolveUnitBattleStatsInput): UnitBattleStats {
  const upgradeModifiers = input.upgradeModifiers ?? {};
  const equipmentBonuses = input.equipmentBonuses ?? {};
  const permanentBonuses = input.permanentBonuses ?? {};

  let stats = computeUnitBaseStatsForLevel(input.blueprint, input.level);
  stats = addUpgradeModifiers(stats, upgradeModifiers);
  stats = addBattleStatBonuses(stats, equipmentBonuses);
  stats = addBattleStatBonuses(stats, permanentBonuses);
  return stats;
}
