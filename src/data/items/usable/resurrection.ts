import type { UsableItemGroup } from "../authoredItemTypes";

/**
 * Resurrection scrolls — raise a fallen ally, in battle or between battles.
 *
 * Strength is authored data, never code: `hpPercent` is the share of the target's max HP it comes
 * back with (at least 1 HP). A stronger scroll is a new entry here with a different id, name,
 * price and `hpPercent`. There is no per-scroll handler, no strength table and no skill level —
 * every consumer reads this one number.
 *
 * `usable` because it is activated from `usable_slot` in battle, against a dead allied FIELD unit
 * during the owner's manual turn (`battle/revive.ts`). Out of combat it works from BOTH origins —
 * the backpack and `usable_slot` alike: a living, non-camp character picks a dead non-camp party
 * member in the target-selection modal, and the raise is persistent and immediate
 * (`progression/itemResurrection.ts`). With no fallen party member it is ineligible and reports
 * `no_valid_targets`, which the item tooltip states in red.
 */
export const RESURRECTION_GROUP = {
  kind: "usable",
  slot: "usable_slot",
  items: {
    small_resurrection_scroll: {
      name: "Small Resurrection Scroll",
      buyPrice: 50,
      useEffect: { type: "revive", hpPercent: 30 },
    },
  },
} satisfies UsableItemGroup;
