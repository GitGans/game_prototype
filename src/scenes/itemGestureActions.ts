import type { PhaseAction } from '../core/phases';
import type { ItemSlotSnapshot } from '../shared/snapshotTypes';

/** The only intents an equip-screen item gesture can express. All are existing `PhaseAction`s. */
export type ItemGestureAction = Extract<
  PhaseAction,
  { type: 'equip_item' | 'unequip_item' | 'request_use_item' }
>;

/**
 * Translates equip-screen item gestures into the gameplay intents they express. All four live here
 * rather than inside the scene, so the whole mapping is in one place and testable without Phaser.
 *
 * Input routing only: nothing here decides whether an action is VALID. `resolveTransition` accepts or
 * rejects it against the committed snapshot, so an ineligible gesture simply produces a rejected
 * transition and no scene-side eligibility rule exists.
 */

/**
 * Single click in the backpack.
 *
 * The switch is exhaustive, so a new `ItemRuntimeKind` fails to compile here instead of silently
 * inheriting another kind's gesture.
 */
export function backpackItemClickAction(
  item: ItemSlotSnapshot,
  selectedUnitTemplateId: string,
): ItemGestureAction {
  const kind = item.metadata.kind;
  switch (kind) {
    case 'equipment':
    // A usable equips like ordinary gear. There is no separate swap intent: `equipItem` already
    // sends an occupied `usable_slot`'s contents back to the backpack slot this one came from.
    case 'usable':
      return { type: 'equip_item', instanceId: item.instanceId, unitTemplateId: selectedUnitTemplateId };
    case 'consumable':
      // Backpack-only and not equippable, so its single click is the use request itself.
      return { type: 'request_use_item', instanceId: item.instanceId, origin: 'backpack' };
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled backpack item kind: ${String(unhandled)}`);
    }
  }
}

/**
 * Double click in the backpack. Reached only for a `usable` — `ItemCell` defers no other kind, and
 * the resolver would reject anything else anyway because no other kind carries a backpack verdict
 * that a second click could act on.
 */
export function backpackItemUseAction(item: ItemSlotSnapshot): ItemGestureAction {
  return { type: 'request_use_item', instanceId: item.instanceId, origin: 'backpack' };
}

/** Single click on an occupied equipment slot. */
export function equippedItemClickAction(
  slot: string,
  selectedUnitTemplateId: string,
): ItemGestureAction {
  return { type: 'unequip_item', unitTemplateId: selectedUnitTemplateId, slot };
}

/** Double click on the equipped usable — the same request, from the other origin. */
export function equippedItemUseAction(item: ItemSlotSnapshot): ItemGestureAction {
  return { type: 'request_use_item', instanceId: item.instanceId, origin: 'equipped_usable' };
}
