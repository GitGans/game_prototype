import type { ItemContainer, ItemInstance, ItemDefinition, BattleStatBonuses } from '../shared/itemTypes';
import { UNIT_BATTLE_STAT_KEYS } from '../shared/unitTypes';
import { createZeroBattleStatMap } from '../shared/battleStatUtils';
import { getEquippedItems } from './equipmentOps';

/**
 * Sum of stat bonuses from all equipped items.
 * Returns a fully populated, all-zero object if there is no equipment container.
 * Missing instances and definitions are skipped.
 */
export function getEquippedBonuses(
  unitTemplateId: string,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
): BattleStatBonuses {
  const bonuses = createZeroBattleStatMap();
  for (const inst of getEquippedItems(unitTemplateId, containers, instances)) {
    const def = definitions[inst.definitionId];
    if (!def) continue;
    for (const key of UNIT_BATTLE_STAT_KEYS) {
      bonuses[key] += def.battleStatBonuses[key];
    }
  }
  return bonuses;
}
