import type { UnitBattleStats, UnitProgressionStatModifiers } from '../../shared/unitTypes';
import type { BattleStatBonuses } from '../../shared/itemTypes';

/**
 * Adds progression upgrade modifiers. Upgrade modifiers may affect ALL eight stats.
 * Optional fields default to 0 per field (matches legacy computeUnitBattleStats).
 */
export function addUpgradeModifiers(
  stats: UnitBattleStats,
  modifiers: UnitProgressionStatModifiers,
): UnitBattleStats {
  return {
    hp:               stats.hp               + (modifiers.hp               ?? 0),
    physicalStrength: stats.physicalStrength + (modifiers.physicalStrength ?? 0),
    magicalStrength:  stats.magicalStrength  + (modifiers.magicalStrength  ?? 0),
    physicalDefense:  stats.physicalDefense  + (modifiers.physicalDefense  ?? 0),
    magicalDefense:   stats.magicalDefense   + (modifiers.magicalDefense   ?? 0),
    dodge:            stats.dodge            + (modifiers.dodge            ?? 0),
    block:            stats.block            + (modifiers.block            ?? 0),
    initiative:       stats.initiative       + (modifiers.initiative       ?? 0),
  };
}

/**
 * Adds equipment OR permanent bonuses. BattleStatBonuses carries only five fields;
 * dodge / block / initiative are intentionally never affected (preserved via spread).
 * Optional fields default to 0 per field.
 */
export function addBattleStatBonuses(
  stats: UnitBattleStats,
  bonuses: Partial<BattleStatBonuses>,
): UnitBattleStats {
  return {
    ...stats,
    hp:               stats.hp               + (bonuses.hp               ?? 0),
    physicalStrength: stats.physicalStrength + (bonuses.physicalStrength ?? 0),
    magicalStrength:  stats.magicalStrength  + (bonuses.magicalStrength  ?? 0),
    physicalDefense:  stats.physicalDefense  + (bonuses.physicalDefense  ?? 0),
    magicalDefense:   stats.magicalDefense   + (bonuses.magicalDefense   ?? 0),
  };
}
