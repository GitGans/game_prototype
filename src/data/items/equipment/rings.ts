import type { EquipmentItemGroup } from '../authoredItemTypes';

export const RINGS_GROUP = {
  kind: 'equipment',
  slot: 'ring',
  items: {
    bronze_ring: {
      name: 'Bronze Ring',
      buyPrice: 40,
      battleStatBonuses: { hp: 5 },
      sprite: 'assets/sprites/items/bronze_ring.png',
    },
    iron_ring: {
      name: 'Iron Ring',
      buyPrice: 60,
      battleStatBonuses: { physicalStrength: 3 },
    },
  },
} satisfies EquipmentItemGroup;
