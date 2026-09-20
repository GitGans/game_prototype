import type { ItemCatalog, ItemContainer, ItemInstance, ItemDefinition, ItemEquipFailure } from '../shared/itemTypes';
import type { UnitClassId } from '../shared/unitTypes';
import { canPlaceItem, findFreeBackpackSlot, findItemLocation, moveItem, applySlotChanges } from './containerOps';
import { resolvePreferredEquipSlot, type ConcreteEquipSlot } from './equipmentSlotResolver';
import { requireSharedBackpack, type InventoryState } from './inventoryState';

export type EquipItemResult =
  | { ok: true; nextInventory: InventoryState }
  | { ok: false; reason: ItemEquipFailure | string };

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
 * What a successful equip would do, decided without producing a next inventory.
 *
 * `swaps` names the instance that would be displaced back to the source slot, or null for a
 * simple move into an empty slot.
 */
export type EvaluateEquipResult =
  | { ok: true; slot: ConcreteEquipSlot; swaps: string | null }
  | { ok: false; reason: ItemEquipFailure };

/**
 * The read half of `equipItem`: EVERY precondition it enforces, and no write.
 *
 * It exists because `canUnitEquipItem` is not a sufficient "can this be equipped" predicate — it
 * checks instance existence, definition existence and class restriction only, while an equip also
 * needs a resolvable slot, an equipment container, a locatable source and, on the swap path, two
 * `canPlaceItem` checks against the VACATED containers. A screen that enabled its Equip control
 * from the narrower predicate would offer actions the pipeline then refuses.
 *
 * `equipItem` is implemented on top of this, so the enabled state on screen and the outcome of
 * the write are decided by the same code and cannot drift.
 */
export function evaluateEquipItem(
  unitTemplateId: string,
  classId: UnitClassId,
  instanceId: string,
  inventory: InventoryState,
  catalog: ItemCatalog,
): EvaluateEquipResult {
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
  if (currentlyEquipped === undefined) return { ok: true, slot, swaps: null };

  // SWAP feasibility, decided against the VACATED containers exactly as the write does.
  if (!instances[currentlyEquipped]) return { ok: false, reason: 'missing_equipped_instance' };
  const vacated = applySlotChanges(containers, [
    { containerId: equipContainerId,     slotKey: slot,             instanceId: null },
    { containerId: location.containerId, slotKey: location.slotKey, instanceId: null },
  ]);
  const oldFitsSource = canPlaceItem(currentlyEquipped, vacated[location.containerId], location.slotKey, instances, catalog);
  const newFitsEquip  = canPlaceItem(instanceId,       vacated[equipContainerId],     slot,             instances, catalog);
  if (!oldFitsSource || !newFitsEquip) return { ok: false, reason: 'invalid_swap' };

  return { ok: true, slot, swaps: currentlyEquipped };
}

/**
 * Equips a backpack item onto the unit's equipment slot.
 * - Empty target slot → simple move (backpack → equipment).
 * - Occupied target slot → SWAP: the equipped item goes to the backpack slot the
 *   new item came from; the new item goes to the equipment slot.
 * Pure: inputs are never mutated. On failure returns a reason and leaves inputs untouched.
 *
 * Owns no precondition of its own — every check lives in `evaluateEquipItem` above.
 */
export function equipItem(
  unitTemplateId: string,
  classId: UnitClassId,
  instanceId: string,
  inventory: InventoryState,
  catalog: ItemCatalog,
): EquipItemResult {
  const { containers, instances } = inventory;

  const evaluation = evaluateEquipItem(unitTemplateId, classId, instanceId, inventory, catalog);
  if (!evaluation.ok) return { ok: false, reason: evaluation.reason };
  const { slot, swaps } = evaluation;

  const equipContainerId = `equip_${unitTemplateId}`;
  // Non-null: evaluateEquipItem returned ok, so the instance is placed exactly once.
  const location = findItemLocation(instanceId, containers)!;

  if (swaps === null) {
    // Simple equip — delegate to moveItem (target slot is empty).
    const result = moveItem(instanceId, location.containerId, location.slotKey, equipContainerId, slot, containers, instances, catalog);
    if (!result.ok) return result;
    return { ok: true, nextInventory: { instances, containers: result.nextContainers } };
  }

  // SWAP. Vacate both slots immutably, then place — feasibility is already proven.
  const vacated = applySlotChanges(containers, [
    { containerId: equipContainerId,     slotKey: slot,             instanceId: null },
    { containerId: location.containerId, slotKey: location.slotKey, instanceId: null },
  ]);
  const nextContainers = applySlotChanges(vacated, [
    { containerId: location.containerId, slotKey: location.slotKey, instanceId: swaps },
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
