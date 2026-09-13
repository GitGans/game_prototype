import type { UsableItemGroup } from "../authoredItemTypes";

/**
 * Resurrection scrolls — revive a dead allied FIELD unit during the owner's manual battle turn.
 *
 * Strength is authored data, never code: `hpPercent` is the share of the target's max HP it comes
 * back with (at least 1 HP). A stronger scroll is a new entry here with a different id, name,
 * price and `hpPercent`. There is no per-scroll handler, no strength table and no skill level —
 * items and revive skills share one percentage-based primitive (`battle/revive.ts`).
 *
 * `usable` because it is activated from `usable_slot` in battle. Using it from the backpack is not
 * supported yet (out-of-combat target selection is future work).
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
