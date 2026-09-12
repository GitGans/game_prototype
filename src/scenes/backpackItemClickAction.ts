import type { PhaseAction } from '../core/phases';
import type { ItemSlotSnapshot } from '../shared/snapshotTypes';

/** The only intents a backpack click can express. All three are existing `PhaseAction` variants. */
export type BackpackItemClickAction = Extract<
  PhaseAction,
  { type: 'equip_item' | 'open_item_actions' | 'request_use_item' }
>;

/**
 * Translates a backpack click into the gameplay intent it expresses. Input routing only: it never
 * decides whether the action is valid — `resolveTransition` accepts or rejects it, and whether the
 * Use/Equip window is visible, and which options it enables, comes solely from the committed
 * `GamePhase`. An ineligible consumable therefore simply produces a rejected transition.
 *
 * The switch is exhaustive, so a new `ItemRuntimeKind` fails to compile here instead of silently
 * inheriting another kind's action.
 */
export function backpackItemClickAction(
  item: ItemSlotSnapshot,
  selectedUnitTemplateId: string,
): BackpackItemClickAction {
  const kind = item.metadata.kind;
  switch (kind) {
    case 'equipment':
      // Ordinary gear equips directly onto the selected character.
      return { type: 'equip_item', instanceId: item.instanceId, unitTemplateId: selectedUnitTemplateId };
    case 'usable':
      // Usable items are both drinkable and equippable, so the player picks in the action window.
      return { type: 'open_item_actions', instanceId: item.instanceId };
    case 'consumable':
      // Backpack-only items go straight to the existing use confirmation.
      return { type: 'request_use_item', instanceId: item.instanceId };
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled backpack item kind: ${String(unhandled)}`);
    }
  }
}
