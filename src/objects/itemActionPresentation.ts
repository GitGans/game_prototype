import type { ItemEquipFailure, ItemUseFailure } from '../shared/itemTypes';
import type {
  ItemActionKind, ItemActionMenuSnapshot, ItemActionOptionSnapshot,
} from '../shared/snapshotTypes';
import { formatUseEffectLine, formatItemBlockedReason } from './itemUseEffectPresentation';

/**
 * Pure wording for the item-action window. Receives structured snapshot data and returns
 * strings — no state, no Phaser, no PhaseManager.
 *
 * It FORMATS AND FORWARDS; it decides nothing. `enabled` is copied through from the snapshot,
 * never recomputed here, and this module has no idea which actions an item supports — the option
 * list arrives already decided by the read model (`core/itemUsability` for use,
 * `inventory.evaluateEquipItem` for equip). A future eligibility rule must not be able to
 * migrate quietly into wording, which is why the tests assert pass-through explicitly.
 */

export interface ItemActionOptionView {
  action: ItemActionKind;
  label: string;
  enabled: boolean;
  disabledExplanation: string | null;
}

const ACTION_LABELS: Record<ItemActionKind, string> = {
  use: 'Use',
  equip: 'Equip',
};

const EQUIP_BLOCKED_REASONS: Record<ItemEquipFailure, string> = {
  missing_instance: 'Cannot equip: this item is no longer available.',
  missing_definition: 'Cannot equip: this item is no longer available.',
  not_equippable: 'Cannot equip: this item has no equipment slot.',
  class_restricted: 'Cannot equip: this character\'s class cannot use it.',
  missing_equip_container: 'Cannot equip: this character has no equipment.',
  missing_location: 'Cannot equip: this item is not in the backpack.',
  missing_equipped_instance: 'Cannot equip: the equipped item is in an inconsistent state.',
  invalid_swap: 'Cannot equip: there is no room to put the replaced item.',
};

/**
 * Disabled reasons come from two different vocabularies — `ItemUseFailure` for Use and
 * `ItemEquipFailure` for Equip — and several members share a name with different wording
 * ("Cannot use" vs "Cannot equip"). The action therefore selects the table; the reason alone
 * would be ambiguous.
 */
function explainDisabled(option: ItemActionOptionSnapshot): string | null {
  if (option.enabled || option.disabledReason === null) return null;
  return option.action === 'equip'
    ? EQUIP_BLOCKED_REASONS[option.disabledReason as ItemEquipFailure]
    : formatItemBlockedReason(option.disabledReason as ItemUseFailure);
}

/** The window's rows, in the order the snapshot supplied them. */
export function buildItemActionOptions(menu: ItemActionMenuSnapshot): ItemActionOptionView[] {
  return menu.options.map(option => ({
    action: option.action,
    label: ACTION_LABELS[option.action],
    enabled: option.enabled,           // copied, never derived
    disabledExplanation: explainDisabled(option),
  }));
}

/** Window heading: what the player is acting on, and for whom. */
export function formatItemActionTitle(menu: ItemActionMenuSnapshot): string {
  return `${menu.itemName} — ${menu.unitName}`;
}

/**
 * Target-independent effect line, or null for an item with no effect. Same wording as the
 * backpack tooltip, so the window never describes an item differently from its hover text.
 */
export function formatItemActionBody(menu: ItemActionMenuSnapshot): string | null {
  return formatUseEffectLine(menu.effect ?? undefined);
}
