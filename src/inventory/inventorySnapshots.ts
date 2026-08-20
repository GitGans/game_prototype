import type { ItemCatalog } from '../shared/itemTypes';
import type { BackpackSnapshot, EquipmentSnapshot, ItemSlotSnapshot } from '../shared/snapshotTypes';
import { BACKPACK_SLOT_COUNT } from './inventoryConstants';
import { requireSharedBackpack, type InventoryState } from './inventoryState';

export function buildBackpackSnapshot(
  inventory: InventoryState,
  catalog: ItemCatalog,
): BackpackSnapshot {
  const backpack = requireSharedBackpack(inventory);
  const { instances } = inventory;
  const slots: Array<ItemSlotSnapshot | null> = Array(BACKPACK_SLOT_COUNT).fill(null);

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
  inventory: InventoryState,
  catalog: ItemCatalog,
): EquipmentSnapshot {
  const { containers, instances } = inventory;
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
