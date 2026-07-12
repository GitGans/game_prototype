import type { EquipSlot, ItemContainer, ItemRuntimeMetadata } from '../shared/itemTypes';

export type ConcreteEquipSlot = Exclude<EquipSlot, 'ring'>;

/** Single source of truth for which concrete slots a 'ring' item may occupy. */
export const RING_EQUIPMENT_SLOTS = ['ring_1', 'ring_2'] as const satisfies readonly ConcreteEquipSlot[];

/**
 * True if `slot` is a valid equipment slot for this item's metadata.
 * Owns the 'ring' → ring_1|ring_2 rule for the whole inventory domain.
 */
export function canMetadataUseEquipmentSlot(
  metadata: ItemRuntimeMetadata,
  slot: string,
): slot is ConcreteEquipSlot {
  if (metadata.slot === null) return false;
  if (metadata.slot === 'ring') return (RING_EQUIPMENT_SLOTS as readonly string[]).includes(slot);
  return slot === metadata.slot;
}

export type ResolveEquipSlotResult =
  | { ok: true; slot: ConcreteEquipSlot }
  | { ok: false; reason: 'not_equippable' | 'no_free_ring_slot' };

/**
 * Picks the concrete equipment slot an item should occupy in `equipmentContainer`.
 * Rings take the first free of RING_EQUIPMENT_SLOTS. Pure; never mutates the container.
 */
export function resolvePreferredEquipSlot(
  metadata: ItemRuntimeMetadata,
  equipmentContainer: ItemContainer,
): ResolveEquipSlotResult {
  if (metadata.slot === null) return { ok: false, reason: 'not_equippable' };
  if (metadata.slot === 'ring') {
    const free = RING_EQUIPMENT_SLOTS.find(s => equipmentContainer.slots[s] === undefined);
    return free ? { ok: true, slot: free } : { ok: false, reason: 'no_free_ring_slot' };
  }
  return { ok: true, slot: metadata.slot }; // narrowed to ConcreteEquipSlot here
}
