import type { UsableItemGroup } from '../authoredItemTypes';

export const HP_RECOVERY_GROUP = {
  kind: 'usable',
  slot: 'usable_slot',
  items: {
    small_hp_jar: {
      name: 'Small HP Jar',
      buyPrice: 25,
      useEffect: { type: 'heal', amount: 30 },
    },
  },
} satisfies UsableItemGroup;
