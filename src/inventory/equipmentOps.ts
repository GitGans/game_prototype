import type { EquipSlot, ItemContainer, ItemInstance, ItemDefinition } from '../shared/itemTypes';
import type { UnitClassId } from '../shared/unitTypes';
import { canPlaceItem, findFreeBackpackSlot, findItemLocation, moveItem, applySlotChanges } from './containerOps';

export type EquipItemResult =
  | { ok: true; nextContainers: Record<string, ItemContainer> }
  | { ok: false; reason: string };

export type UnequipItemResult =
  | { ok: true; nextContainers: Record<string, ItemContainer> }
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
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
): EquipItemResult {
  const instance = instances[instanceId];
  if (!instance) return { ok: false, reason: 'missing_instance' };
  const definition = definitions[instance.definitionId];
  if (!definition) return { ok: false, reason: 'missing_definition' };
  if (!definition.equipSlot) return { ok: false, reason: 'not_equippable' };
  if (!canUnitEquipItem(classId, instanceId, instances, definitions)) return { ok: false, reason: 'class_restricted' };

  const equipContainerId = `equip_${unitTemplateId}`;
  const equipContainer = containers[equipContainerId];
  if (!equipContainer) return { ok: false, reason: 'missing_equip_container' };

  // Rings can equip into ring_1 or ring_2; pick first free, else swap ring_1.
  const slot: EquipSlot = definition.equipSlot === 'ring'
    ? ((['ring_1', 'ring_2'] as EquipSlot[]).find(s => equipContainer.slots[s] === undefined) ?? 'ring_1')
    : definition.equipSlot;

  const location = findItemLocation(instanceId, containers);
  if (!location) return { ok: false, reason: 'missing_location' };

  const currentlyEquipped = equipContainer.slots[slot];

  if (currentlyEquipped === undefined) {
    // Simple equip — delegate to moveItem (target slot is empty).
    return moveItem(instanceId, location.containerId, location.slotKey, equipContainerId, slot, containers, instances, definitions);
  }

  // SWAP. Vacate both slots immutably, validate against the vacated state, then place.
  if (!instances[currentlyEquipped]) return { ok: false, reason: 'missing_equipped_instance' };
  const vacated = applySlotChanges(containers, [
    { containerId: equipContainerId,     slotKey: slot,             instanceId: null },
    { containerId: location.containerId, slotKey: location.slotKey, instanceId: null },
  ]);
  const oldFitsSource = canPlaceItem(currentlyEquipped, vacated[location.containerId], location.slotKey, instances, definitions);
  const newFitsEquip  = canPlaceItem(instanceId,       vacated[equipContainerId],     slot,             instances, definitions);
  if (!oldFitsSource || !newFitsEquip) return { ok: false, reason: 'invalid_swap' }; // inputs untouched

  const nextContainers = applySlotChanges(vacated, [
    { containerId: location.containerId, slotKey: location.slotKey, instanceId: currentlyEquipped },
    { containerId: equipContainerId,     slotKey: slot,             instanceId },
  ]);
  return { ok: true, nextContainers };
}

/**
 * Unequips the item in the given slot, moving it to the first free backpack slot
 * (searches all 24). Pure. Returns a reason on failure (backpack full / slot empty).
 */
export function unequipItem(
  unitTemplateId: string,
  slot: EquipSlot,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
  backpackId: string = 'backpack_shared',
): UnequipItemResult {
  const equipContainerId = `equip_${unitTemplateId}`;
  const equipContainer = containers[equipContainerId];
  const backpack = containers[backpackId];
  if (!equipContainer) return { ok: false, reason: 'missing_equip_container' };
  if (!backpack)       return { ok: false, reason: 'missing_backpack_container' };

  const instanceId = equipContainer.slots[slot];
  if (instanceId === undefined) return { ok: false, reason: 'slot_empty' };

  const freeSlot = findFreeBackpackSlot(backpack);
  if (freeSlot === null) return { ok: false, reason: 'backpack_full' };

  return moveItem(instanceId, equipContainerId, slot, backpackId, freeSlot, containers, instances, definitions);
}
