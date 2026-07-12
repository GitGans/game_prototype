import type { ConsumableItemGroup } from '../authoredItemTypes';

export const PERMANENT_STAT_CONSUMABLES_GROUP = {
  kind: 'consumable',
  items: {
    vitality_essence: {
      name: 'Vitality Essence',
      buyPrice: 100,
      useEffect: { type: 'permanent_stat_boost', stat: 'hp', amount: 5 },
    },
    might_essence: {
      name: 'Might Essence',
      buyPrice: 120,
      useEffect: { type: 'permanent_stat_boost', stat: 'physicalStrength', amount: 2 },
    },
  },
} satisfies ConsumableItemGroup;
