import type { ItemCatalog, ItemContainer, ItemInstance, ItemDefinition } from '../shared/itemTypes';
import type { UnitClassId } from '../shared/unitTypes';
import { canPlaceItem, findFreeBackpackSlot, findItemLocation, moveItem, applySlotChanges } from './containerOps';
import { resolvePreferredEquipSlot, type ConcreteEquipSlot } from './equipmentSlotResolver';
import { requireSharedBackpack, type InventoryState } from './inventoryState';

export type EquipItemResult =
  | { ok: true; nextInventory: InventoryState }
  | { ok: false; reason: string };

export type UnequipItemResult =
  | { ok: true; nextInventory: InventoryState }
  | { ok: false; reason: string };

/**
 * Returns true if the unit class is allowed to equip this item.
 * If the item has no allowedClassIds (or empty array), all classes are allowed.
 */
export function canUnitEquipItem(
  classId: UnitClassId,
  instanceId: string,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
): boolean {
  const instance = instances[instanceId];
  if (!instance) return false;
  const definition = definitions[instance.definitionId];
  if (!definition) return false;
  if (!definition.allowedClassIds || definition.allowedClassIds.length === 0) return true;
  return definition.allowedClassIds.includes(classId);
}

/**
 * Returns all equipped ItemInstances for a unit.
 * Returns [] if the equipment container doesn't exist or all slots are empty.
 */
export function getEquippedItems(
  unitTemplateId: string,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
): ItemInstance[] {
  const equip = containers[`equip_${unitTemplateId}`];
  if (!equip) return [];
  return Object.values(equip.slots)
    .map(id => instances[id])
    .filter((inst): inst is ItemInstance => inst !== undefined);
}

/**
 * Equips a backpack item onto the unit's equipment slot.
 * - Empty target slot → simple move (backpack → equipment).
 * - Occupied target slot → SWAP: the equipped item goes to the backpack slot the
 *   new item came from; the new item goes to the equipment slot.
 * Pure: inputs are never mutated. On failure returns a reason and leaves inputs untouched.
 */
export function equipItem(
  unitTemplateId: string,
  classId: UnitClassId,
  instanceId: string,
  inventory: InventoryState,
  catalog: ItemCatalog,
): EquipItemResult {
  const { containers, instances } = inventory;
  const instance = instances[instanceId];
  if (!instance) return { ok: false, reason: 'missing_instance' };
  const definition = catalog.definitions[instance.definitionId];
  const metadata = catalog.metadataById[instance.definitionId];
  if (!definition || !metadata) return { ok: false, reason: 'missing_definition' };
  if (metadata.slot === null) return { ok: false, reason: 'not_equippable' };
  if (!canUnitEquipItem(classId, instanceId, instances, catalog.definitions)) return { ok: false, reason: 'class_restricted' };

  const equipContainerId = `equip_${unitTemplateId}`;
  const equipContainer = containers[equipContainerId];
  if (!equipContainer) return { ok: false, reason: 'missing_equip_container' };

  // Resolve target slot. Player-action semantics: full rings swap ring_1 (preserved).
  let slot: ConcreteEquipSlot;
  const resolved = resolvePreferredEquipSlot(metadata, equipContainer);
  if (resolved.ok) {
    slot = resolved.slot;
  } else if (resolved.reason === 'no_free_ring_slot') {
    slot = 'ring_1'; // both rings full → fall through to the existing swap path
  } else {
    return { ok: false, reason: 'not_equippable' };
  }

  const location = findItemLocation(instanceId, containers);
  if (!location) return { ok: false, reason: 'missing_location' };

  const currentlyEquipped = equipContainer.slots[slot];

  if (currentlyEquipped === undefined) {
    // Simple equip — delegate to moveItem (target slot is empty).
    const result = moveItem(instanceId, location.containerId, location.slotKey, equipContainerId, slot, containers, instances, catalog);
    if (!result.ok) return result;
    return { ok: true, nextInventory: { instances, containers: result.nextContainers } };
  }

  // SWAP. Vacate both slots immutably, validate against the vacated state, then place.
  if (!instances[currentlyEquipped]) return { ok: false, reason: 'missing_equipped_instance' };
  const vacated = applySlotChanges(containers, [
    { containerId: equipContainerId,     slotKey: slot,             instanceId: null },
    { containerId: location.containerId, slotKey: location.slotKey, instanceId: null },
  ]);
  const oldFitsSource = canPlaceItem(currentlyEquipped, vacated[location.containerId], location.slotKey, instances, catalog);
  const newFitsEquip  = canPlaceItem(instanceId,       vacated[equipContainerId],     slot,             instances, catalog);
  if (!oldFitsSource || !newFitsEquip) return { ok: false, reason: 'invalid_swap' }; // inputs untouched

  const nextContainers = applySlotChanges(vacated, [
    { containerId: location.containerId, slotKey: location.slotKey, instanceId: currentlyEquipped },
    { containerId: equipContainerId,     slotKey: slot,             instanceId },
  ]);
  return { ok: true, nextInventory: { instances, containers: nextContainers } };
}

/**
 * Unequips the item in the given slot, moving it to the first free backpack slot
 * (searches all 24). Pure. Returns a reason on failure (backpack full / slot empty).
 * The destination backpack is the structurally identified shared backpack — its
 * technical container id does not matter.
 */
export function unequipItem(
  unitTemplateId: string,
  slot: ConcreteEquipSlot,
  inventory: InventoryState,
  catalog: ItemCatalog,
): UnequipItemResult {
  const { containers, instances } = inventory;
  const equipContainerId = `equip_${unitTemplateId}`;
  const equipContainer = containers[equipContainerId];
  if (!equipContainer) return { ok: false, reason: 'missing_equip_container' };

  const instanceId = equipContainer.slots[slot];
  if (instanceId === undefined) return { ok: false, reason: 'slot_empty' };

  const backpack = requireSharedBackpack(inventory);
  const freeSlot = findFreeBackpackSlot(backpack);
  if (freeSlot === null) return { ok: false, reason: 'backpack_full' };

  const result = moveItem(instanceId, equipContainerId, slot, backpack.id, freeSlot, containers, instances, catalog);
  if (!result.ok) return result;
  return { ok: true, nextInventory: { instances, containers: result.nextContainers } };
}
