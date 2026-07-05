import type { ItemCatalog, ItemContainer, ItemInstance } from '../shared/itemTypes';
import type { BackpackSnapshot, EquipmentSnapshot, ItemSlotSnapshot } from '../shared/snapshotTypes';
import { BACKPACK_SLOT_COUNT } from './inventoryConstants';

export function buildBackpackSnapshot(
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  catalog: ItemCatalog,
  containerId = 'backpack_shared',
): BackpackSnapshot {
  const backpack = containers[containerId];
  const slots: Array<ItemSlotSnapshot | null> = Array(BACKPACK_SLOT_COUNT).fill(null);
  if (!backpack) return { slots };

  for (let i = 0; i < BACKPACK_SLOT_COUNT; i++) {
    const instanceId = backpack.slots[String(i)];
    if (!instanceId) continue;
    const instance = instances[instanceId];
    const definition = instance ? catalog.definitions[instance.definitionId] : undefined;
    const metadata = instance ? catalog.metadataById[instance.definitionId] : undefined;
    if (instance && definition && metadata) slots[i] = { instanceId, definition, metadata };
  }
  return { slots };
}

export function buildEquipmentSnapshot(
  unitTemplateId: string,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  catalog: ItemCatalog,
): EquipmentSnapshot {
  const equip = containers[`equip_${unitTemplateId}`];
  if (!equip) return { slots: {} };

  const slots: Partial<Record<string, ItemSlotSnapshot>> = {};
  for (const [slotKey, instanceId] of Object.entries(equip.slots)) {
    const instance = instances[instanceId];
    const definition = instance ? catalog.definitions[instance.definitionId] : undefined;
    const metadata = instance ? catalog.metadataById[instance.definitionId] : undefined;
    if (instance && definition && metadata) slots[slotKey] = { instanceId, definition, metadata };
  }
  return { slots };
}
