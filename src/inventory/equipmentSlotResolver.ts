import type { EquipSlot, ItemContainer, ItemDefinition } from '../shared/itemTypes';

export type ConcreteEquipSlot = Exclude<EquipSlot, 'ring'>;

/** Single source of truth for which concrete slots a 'ring' item may occupy. */
export const RING_EQUIPMENT_SLOTS = ['ring_1', 'ring_2'] as const satisfies readonly ConcreteEquipSlot[];

/**
 * True if `slot` is a valid equipment slot for this definition.
 * Owns the 'ring' → ring_1|ring_2 rule for the whole inventory domain.
 */
export function canDefinitionUseEquipmentSlot(
  definition: ItemDefinition,
  slot: string,
): slot is ConcreteEquipSlot {
  if (definition.equipSlot === null) return false;
  if (definition.equipSlot === 'ring') return (RING_EQUIPMENT_SLOTS as readonly string[]).includes(slot);
  return slot === definition.equipSlot;
}

export type ResolveEquipSlotResult =
  | { ok: true; slot: ConcreteEquipSlot }
  | { ok: false; reason: 'not_equippable' | 'no_free_ring_slot' };

/**
 * Picks the concrete equipment slot an item should occupy in `equipmentContainer`.
 * Rings take the first free of RING_EQUIPMENT_SLOTS. Pure; never mutates the container.
 */
export function resolvePreferredEquipSlot(
  definition: ItemDefinition,
  equipmentContainer: ItemContainer,
): ResolveEquipSlotResult {
  if (definition.equipSlot === null) return { ok: false, reason: 'not_equippable' };
  if (definition.equipSlot === 'ring') {
    const free = RING_EQUIPMENT_SLOTS.find(s => equipmentContainer.slots[s] === undefined);
    return free ? { ok: true, slot: free } : { ok: false, reason: 'no_free_ring_slot' };
  }
  return { ok: true, slot: definition.equipSlot }; // narrowed to ConcreteEquipSlot here
}
