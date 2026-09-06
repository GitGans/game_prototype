import type { ConsumableUseFailure, ItemUseEffect } from '../shared/itemTypes';
import type { PendingConsumePrompt } from '../shared/snapshotTypes';
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
function describeBoost(stat: PendingConsumePrompt['stat'], amount: number): string {
  const magnitude = formatStatValue(stat, amount);
  if (stat === 'hp') {
    return `+${magnitude} Max HP permanently, and restores ${magnitude} HP now.`;
  }
  return `+${magnitude} ${STAT_PRESENTATION[stat].label} permanently.`;
}

/** Confirmation dialog body. */
export function formatConsumePrompt(prompt: PendingConsumePrompt): string {
  return `Use ${prompt.itemName} on ${prompt.unitName}?\n${describeBoost(prompt.stat, prompt.amount)}`;
}

/** Tooltip line for a consumable's effect. Returns null for effects with no mechanics yet. */
export function formatUseEffectLine(effect: ItemUseEffect | undefined): string | null {
  if (!effect) return null;
  if (effect.type !== 'permanent_stat_boost') return null; // heal / revive are not implemented
  return describeBoost(effect.stat, effect.amount);
}

const BLOCKED_REASONS: Record<ConsumableUseFailure, string> = {
  unit_dead: 'Cannot use: this character is dead.',
  unit_not_found: 'Cannot use: no character is selected.',
  blueprint_not_found: 'Cannot use: no character is selected.',
  unsupported_effect: 'Cannot use: this effect is not implemented yet.',
  missing_use_effect: 'Cannot use: this item has no effect.',
  not_consumable: 'Cannot use: this item is not consumable.',
  missing_instance: 'Cannot use: this item is no longer available.',
  missing_definition: 'Cannot use: this item is no longer available.',
  not_in_backpack: 'Cannot use: this item is not in the backpack.',
  duplicate_placement: 'Cannot use: this item is in an inconsistent state.',
  invalid_amount: 'Cannot use: this item has an invalid effect value.',
  invalid_result: 'Cannot use: this item has an invalid effect value.',
};

/** Always shown for an ineligible consumable — the reason is part of the behaviour contract. */
export function formatConsumableBlockedReason(reason: ConsumableUseFailure): string {
  return BLOCKED_REASONS[reason];
}
