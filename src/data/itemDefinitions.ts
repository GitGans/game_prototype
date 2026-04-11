import { ItemDefinition } from "../battle/types";

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  bronze_ring: {
    id: "bronze_ring",
    name: "Bronze Ring",
    equipSlot: "ring",
    statBonuses: { hp: 2 },
    description: "+2 HP",
    sprite: "assets/sprites/items/bronze_ring.png",
  },
  iron_ring: {
    id: "iron_ring",
    name: "Iron Ring",
    equipSlot: "ring",
    statBonuses: { physicalDamage: 2 },
    description: "+2 Physical Damage",
  },
  bronze_necklace: {
    id: "bronze_necklace",
    name: "Bronze Necklace",
    equipSlot: "necklace",
    allowedClasses: ["warrior"],
    statBonuses: { hp: 5 },
    description: "+5 HP",
    sprite: "assets/sprites/items/bronze_necklace.png",
  },
};
