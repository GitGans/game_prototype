import { ItemDefinition, ItemStatBonuses } from "../battle/types";

const STAT_LABELS: Record<keyof ItemStatBonuses, string> = {
  hp: "HP",
  physicalDamage: "Physical Damage",
  magicalDamage: "Magical Damage",
  physicalDefense: "Physical Defense",
  magicalDefense: "Magical Defense",
};

export function getItemDescription(def: ItemDefinition): string {
  return (Object.keys(def.statBonuses) as (keyof ItemStatBonuses)[])
    .filter((key) => def.statBonuses[key] !== undefined)
    .map((key) => `+${def.statBonuses[key]} ${STAT_LABELS[key]}`)
    .join("\n");
}

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  bronze_ring: {
    id: "bronze_ring",
    name: "Bronze Ring",
    equipSlot: "ring",
    statBonuses: { hp: 2 },
    sprite: "assets/sprites/items/bronze_ring.png",
  },
  iron_ring: {
    id: "iron_ring",
    name: "Iron Ring",
    equipSlot: "ring",
    statBonuses: { physicalDamage: 2 },
  },
  bronze_necklace: {
    id: "bronze_necklace",
    name: "Bronze Necklace",
    equipSlot: "necklace",
    allowedClasses: ["warrior", "pikeman", "halberdist", "crusher"],
    statBonuses: { hp: 5 },
    sprite: "assets/sprites/items/bronze_necklace.png",
  },
};
