import { ItemDefinition } from "../battle/types";

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  wooden_ring: {
    id: "bronze_ring",
    name: "Bronze Ring",
    equipSlot: "ring",
    statBonuses: { hp: 10 },
    description: "+10 HP",
    sprite: "assets/sprites/items/bronze_ring.png",
  },
  iron_ring: {
    id: "iron_ring",
    name: "Iron Ring",
    equipSlot: "ring",
    statBonuses: { hp: 25 },
    description: "+25 HP",
  },
  battle_charm: {
    id: "battle_charm",
    name: "Battle Charm",
    equipSlot: "necklace",
    allowedClasses: ["warrior"],
    statBonuses: { physicalDamage: 5 },
    description: "+5 Physical Damage",
  },
};
