import type {
  BattleItemUseFailure, ItemUseFailure, ItemUseEffect, ReadonlyItemUseEffect,
} from '../shared/itemTypes';
import type { ItemEffectPreview, PendingItemUsePrompt } from '../shared/snapshotTypes';
import type { UnitBattleStatKey } from '../shared/unitTypes';
import { STAT_PRESENTATION, formatStatValue } from './statPresentation';

/**
 * Pure wording for item use effects. Receives structured snapshot data and returns strings —
 * no state, no Phaser, no PhaseManager. Core cannot own this (core must not import objects/),
 * which is why the phase snapshot carries structured effect data rather than formatted text.
 */

/**
 * HP is the one stat whose boost has two visible consequences: the permanent maximum and the
 * immediate restoration. Both must be stated, or the player cannot tell a heal from a growth.
 */
function describeBoost(stat: UnitBattleStatKey, amount: number): string {
  const magnitude = formatStatValue(stat, amount);
  if (stat === 'hp') {
    return `+${magnitude} Max HP permanently, and restores ${magnitude} HP now.`;
  }
  return `+${magnitude} ${STAT_PRESENTATION[stat].label} permanently.`;
}

/**
 * Ordinary healing restores current HP only — the wording must never suggest a permanent gain,
 * which is what separates a potion from an HP essence in the player's reading.
 *
 * It reports the ACTUAL restoration for this target (`restoredHp`, already clamped to missing HP
 * by progression), not the item's nominal amount. `nextHp` is derived here rather than carried in
 * the snapshot: it is one addition, and a stored copy could contradict the fields around it.
 */
function describeHeal(effect: Extract<ItemEffectPreview, { type: 'heal' }>): string {
  const restored = formatStatValue('hp', effect.restoredHp);
  const from = formatStatValue('hp', effect.currentHp);
  const to = formatStatValue('hp', effect.currentHp + effect.restoredHp);
  return `Restores ${restored} HP: ${from} → ${to}.`;
}

/** Confirmation dialog body. */
export function formatItemUsePrompt(prompt: PendingItemUsePrompt): string {
  const body = prompt.effect.type === 'heal'
    ? describeHeal(prompt.effect)
    : describeBoost(prompt.effect.stat, prompt.effect.amount);
  return `Use ${prompt.itemName} on ${prompt.unitName}?\n${body}`;
}

/**
 * Tooltip line for a consumable's effect. Target-independent — it describes the item from the
 * catalog, so healing states the nominal ceiling ("up to"), not this character's restoration.
 * Returns null for effects with no mechanics yet.
 */
export function formatUseEffectLine(effect: ReadonlyItemUseEffect | ItemUseEffect | undefined): string | null {
  if (!effect) return null;
  if (effect.type === 'heal') return `Restores up to ${formatStatValue('hp', effect.amount)} HP.`;
  if (effect.type !== 'permanent_stat_boost') return null; // revive is not implemented
  return describeBoost(effect.stat, effect.amount);
}

const BLOCKED_REASONS: Record<ItemUseFailure, string> = {
  unit_dead: 'Cannot use: this character is dead.',
  unit_full_hp: 'Cannot use: this character is already at full HP.',
  unit_not_found: 'Cannot use: no character is selected.',
  blueprint_not_found: 'Cannot use: no character is selected.',
  unsupported_effect: 'Cannot use: this effect is not implemented yet.',
  missing_use_effect: 'Cannot use: this item has no effect.',
  not_usable_from_here: 'Cannot use: this item cannot be used from here.',
  not_equipped_by_unit: 'Cannot use: this character is not carrying this item.',
  missing_instance: 'Cannot use: this item is no longer available.',
  missing_definition: 'Cannot use: this item is no longer available.',
  not_in_backpack: 'Cannot use: this item is not in the backpack.',
  duplicate_placement: 'Cannot use: this item is in an inconsistent state.',
  invalid_amount: 'Cannot use: this item has an invalid effect value.',
  invalid_result: 'Cannot use: this item has an invalid effect value.',
};

/** Always shown for an ineligible consumable — the reason is part of the behaviour contract. */
export function formatItemBlockedReason(reason: ItemUseFailure): string {
  return BLOCKED_REASONS[reason];
}

const BATTLE_BLOCKED_REASONS: Record<BattleItemUseFailure, string> = {
  not_manual_mode: 'Not available during automatic combat.',
  not_awaiting_manual_action: 'Not available right now.',
  not_active_unit: 'Not this character\'s turn.',
  unit_dead: 'This character is dead.',
  unit_not_on_field: 'This character is not on the field.',
  instance_mismatch: 'This item is no longer available.',
  already_consumed: 'This item has already been used.',
  unsupported_effect: 'This effect is not implemented yet.',
  invalid_amount: 'This item has an invalid effect value.',
  unit_full_hp: 'Already at full HP.',
};

/**
 * Skill-bar tooltip for an equipped item action.
 *
 * It states the two consequences the player cannot see from the icon — the item is CONSUMED and
 * the turn ENDS — because both are irreversible, and an ordinary skill does neither. The amount
 * is the authored ceiling, target-independent, exactly like the backpack tooltip.
 */
export function formatBattleItemActionTooltip(
  itemName: string,
  effect: ReadonlyItemUseEffect,
  disabledReason: BattleItemUseFailure | null,
): string {
  const lines = [itemName];
  const effectLine = formatUseEffectLine(effect);
  if (effectLine) lines.push(effectLine);
  lines.push('Uses up the item and ends the turn.');
  if (disabledReason) lines.push(BATTLE_BLOCKED_REASONS[disabledReason]);
  return lines.join(' ');
}
