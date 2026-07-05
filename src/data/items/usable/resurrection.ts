import type { UsableItemGroup } from '../authoredItemTypes';

export const RESURRECTION_GROUP = {
  kind: 'usable',
  slot: 'usable_slot',
  items: {
    resurrection_scroll: {
      name: 'Resurrection Scroll',
      buyPrice: 150,
      useEffect: { type: 'revive' },
    },
  },
} satisfies UsableItemGroup;
