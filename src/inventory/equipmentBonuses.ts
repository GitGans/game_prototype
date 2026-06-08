import type { ItemContainer, ItemInstance, ItemDefinition, BattleStatBonuses } from '../shared/itemTypes';
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
  const bonuses: BattleStatBonuses = {
    hp: 0, physicalStrength: 0, magicalStrength: 0, physicalDefense: 0, magicalDefense: 0,
  };
  for (const inst of getEquippedItems(unitTemplateId, containers, instances)) {
    const def = definitions[inst.definitionId];
    if (!def) continue;
    bonuses.hp               += def.battleStatBonuses.hp;
    bonuses.physicalStrength += def.battleStatBonuses.physicalStrength;
    bonuses.magicalStrength  += def.battleStatBonuses.magicalStrength;
    bonuses.physicalDefense  += def.battleStatBonuses.physicalDefense;
    bonuses.magicalDefense   += def.battleStatBonuses.magicalDefense;
  }
  return bonuses;
}
