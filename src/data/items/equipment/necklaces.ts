import { ucid } from '../../../shared/unitTypes';
import type { EquipmentItemGroup } from '../authoredItemTypes';

export const NECKLACES_GROUP = {
  kind: 'equipment',
  slot: 'necklace',
  items: {
    bronze_necklace: {
      name: 'Bronze Necklace',
      buyPrice: 50,
      allowedClassIds: [ucid('warrior'), ucid('pikeman'), ucid('halberdist'), ucid('crusher')],
      battleStatBonuses: { magicalStrength: 3 },
      sprite: 'assets/sprites/items/bronze_necklace.png',
    },
  },
} satisfies EquipmentItemGroup;
