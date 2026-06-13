import type { UnitBlueprint, UnitProgressionStatModifiers } from '../shared/unitTypes';
import type { ItemContainer, ItemInstance, ItemDefinition, BattleStatBonuses } from '../shared/itemTypes';
import type { UnitStatsSnapshot } from '../shared/snapshotTypes';
import { getEquippedBonuses } from '../inventory';
import { resolveUnitBattleStats } from '../progression';

export function buildUnitStatsSnapshot(
  blueprint:        UnitBlueprint,
  level:            number,
  permanentBonuses: Partial<BattleStatBonuses>,
  itemContainers:   Record<string, ItemContainer>,
  itemInstances:    Record<string, ItemInstance>,
  itemDefinitions:  Record<string, ItemDefinition>,
  upgradeModifiers: UnitProgressionStatModifiers,
): UnitStatsSnapshot {
  const equipmentBonuses = getEquippedBonuses(
    blueprint.templateId, itemContainers, itemInstances, itemDefinitions,
  );

  // Color baseline: everything EXCEPT equipment (permanent bonuses are included,
  // so they change the number but never the color).
  const highlightBaseStats = resolveUnitBattleStats({
    blueprint,
    level,
    upgradeModifiers,
    permanentBonuses,
  });

  // Displayed value: highlight baseline + equipment.
  const displayStats = resolveUnitBattleStats({
    blueprint,
    level,
    upgradeModifiers,
    equipmentBonuses,
    permanentBonuses,
  });

  const pair = (k: keyof typeof displayStats) => ({
    highlightBase: highlightBaseStats[k],
    value:         displayStats[k],
  });

  return {
    level,
    hp:               pair('hp'),
    maxHp:            pair('hp'),
    physicalStrength: pair('physicalStrength'),
    magicalStrength:  pair('magicalStrength'),
    physicalDefense:  pair('physicalDefense'),
    magicalDefense:   pair('magicalDefense'),
    dodge:            pair('dodge'),
    block:            pair('block'),
    initiative:       pair('initiative'),
  };
}
