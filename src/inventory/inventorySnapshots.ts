import type { ItemContainer, ItemInstance, ItemDefinition, UnitActivatableAbility } from '../shared/itemTypes';
import type { BackpackSnapshot, EquipmentSnapshot, ItemSlotSnapshot } from '../shared/snapshotTypes';
import { getEquippedItems } from './equipmentOps';
import { BACKPACK_SLOT_COUNT } from './inventoryConstants';

export function buildBackpackSnapshot(
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
  containerId = 'backpack_shared',
): BackpackSnapshot {
  const backpack = containers[containerId];
  const slots: Array<ItemSlotSnapshot | null> = Array(BACKPACK_SLOT_COUNT).fill(null);
  if (!backpack) return { slots };

  for (let i = 0; i < BACKPACK_SLOT_COUNT; i++) {
    const instanceId = backpack.slots[String(i)];
    if (!instanceId) continue;
    const instance = instances[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (instance && definition) slots[i] = { instanceId, definition };
  }
  return { slots };
}

export function buildEquipmentSnapshot(
  unitTemplateId: string,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
): EquipmentSnapshot {
  const equip = containers[`equip_${unitTemplateId}`];
  if (!equip) return { slots: {} };

  const slots: Partial<Record<string, ItemSlotSnapshot>> = {};
  for (const [slotKey, instanceId] of Object.entries(equip.slots)) {
    const instance = instances[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (instance && definition) slots[slotKey] = { instanceId, definition };
  }
  return { slots };
}

export function snapshotActivatableAbilities(
  unitTemplateId: string,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
): UnitActivatableAbility[] {
  const result: UnitActivatableAbility[] = [];
  for (const inst of getEquippedItems(unitTemplateId, containers, instances)) {
    const def = definitions[inst.definitionId];
    if (def?.usage === 'equip_and_activate' && def.useEffect) {
      result.push({ sourceItemDefinitionId: def.id, name: def.name, useEffect: def.useEffect, usesRemaining: 1 });
    }
  }
  return result;
}
