import type { UnitBlueprint } from '../shared/unitTypes';
import type { ItemDefinition } from '../shared/itemTypes';
import type { StartingItemDefinition } from '../data/startingInventoryDefinitions';
import { resolveUnitProgression, type UnitUpgradeChoices } from '../progression';

export interface AssertStartingClassRestrictionsInput {
  playerUnits: readonly UnitBlueprint[];
  itemDefinitions: Record<string, ItemDefinition>;
  startingItems: readonly StartingItemDefinition[];
  /** Optional per-unit chosen upgrades. Omitted at new_game (fresh units → base class). */
  chosenUpgradesByUnit?: Record<string, UnitUpgradeChoices>;
}

/**
 * Validates that every equipped starting item can be worn by its target unit's resolved class.
 * Lives in core/ (not inventory/) because resolving the class needs progression. Both campaign
 * new_game and debug startup call this before buildStartingInventory.
 */
export function assertStartingEquipmentClassRestrictions(input: AssertStartingClassRestrictionsInput): void {
  const { playerUnits, itemDefinitions, startingItems, chosenUpgradesByUnit = {} } = input;
  for (const item of startingItems) {
    if (item.placement.kind !== 'equipped') continue;
    const { unitTemplateId } = item.placement;
    const bp = playerUnits.find(u => u.templateId === unitTemplateId);
    if (!bp) throw new Error(`Equipped starting item "${item.instanceId}" targets unknown unit "${unitTemplateId}"`);
    const def = itemDefinitions[item.itemDefinitionId];
    if (!def) throw new Error(`Starting item "${item.instanceId}" references unknown itemDefinitionId "${item.itemDefinitionId}"`);

    const allowed = def.allowedClassIds;
    if (!allowed || allowed.length === 0) continue; // unrestricted item

    const { currentClassId } = resolveUnitProgression(bp, chosenUpgradesByUnit[unitTemplateId] ?? {});
    if (!allowed.includes(currentClassId)) {
      throw new Error(
        `Starting item "${item.instanceId}" (${item.itemDefinitionId}) cannot be equipped by ` +
        `unit "${unitTemplateId}" of class "${currentClassId}"`,
      );
    }
  }
}
