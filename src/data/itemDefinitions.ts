import { ItemDefinition } from '../battle/types';

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  wooden_ring: {
    id: 'wooden_ring',
    name: 'Wooden Ring',
    equipSlot: 'accessory',
    statBonuses: { hp: 10 },
    description: '+10 HP',
  },
  iron_ring: {
    id: 'iron_ring',
    name: 'Iron Ring',
    equipSlot: 'accessory',
    statBonuses: { hp: 25 },
    description: '+25 HP',
  },
  battle_charm: {
    id: 'battle_charm',
    name: 'Battle Charm',
    equipSlot: 'accessory',
    statBonuses: { physicalDamage: 5 },
    description: '+5 Physical Damage',
  },
};
