import type { UsableItemGroup } from '../authoredItemTypes';

/**
 * Healing potions — restore current HP, never max HP or permanent bonuses.
 *
 * Strength is authored data, never code: a stronger potion is a new entry here with a different
 * id, name, price and `amount`. There is no per-potion handler, strength table or named branch
 * anywhere in the runtime.
 *
 * `usable` rather than `consumable` because these are activated from two places: the backpack
 * (out of combat, via the item-action window) and `usable_slot` (during a manual battle turn).
 */
export const HEALING_USABLES_GROUP = {
  kind: 'usable',
  slot: 'usable_slot',
  items: {
    small_healing_potion: {
      name: 'Small Healing Potion',
      buyPrice: 25,
      useEffect: { type: 'heal', amount: 10 },
    },
  },
} satisfies UsableItemGroup;
