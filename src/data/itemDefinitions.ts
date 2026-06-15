import type { BattleStatBonuses, ItemDefinition } from "../shared/itemTypes";
import { ucid } from "../shared/unitTypes";

const STAT_LABELS: Record<keyof BattleStatBonuses, string> = {
  hp: "HP",
  physicalStrength: "Physical Damage",
  magicalStrength: "Magical Damage",
  physicalDefense: "Physical Defense",
  magicalDefense: "Magical Defense",
};

export function getItemDescription(def: ItemDefinition): string {
  return (Object.keys(def.battleStatBonuses) as (keyof BattleStatBonuses)[])
    .filter((key) => def.battleStatBonuses[key] !== 0)
    .map((key) => `+${def.battleStatBonuses[key]} ${STAT_LABELS[key]}`)
    .join("\n");
}

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  bronze_ring: {
    id: "bronze_ring",
    name: "Bronze Ring",
    usage: "equip",
    equipSlot: "ring",
    buyPrice: 40,
    battleStatBonuses: {
      hp: 5,
      physicalStrength: 0,
      magicalStrength: 0,
      physicalDefense: 0,
      magicalDefense: 0,
    },
    sprite: "assets/sprites/items/bronze_ring.png",
  },
  iron_ring: {
    id: "iron_ring",
    name: "Iron Ring",
    usage: "equip",
    equipSlot: "ring",
    buyPrice: 60,
    battleStatBonuses: {
      hp: 0,
      physicalStrength: 3,
      magicalStrength: 0,
      physicalDefense: 0,
      magicalDefense: 0,
    },
  },
  bronze_necklace: {
    id: "bronze_necklace",
    name: "Bronze Necklace",
    usage: "equip",
    equipSlot: "necklace",
    buyPrice: 50,
    allowedClassIds: [
      ucid("warrior"),
      ucid("pikeman"),
      ucid("halberdist"),
      ucid("crusher"),
    ],
    battleStatBonuses: {
      hp: 0,
      physicalStrength: 0,
      magicalStrength: 3,
      physicalDefense: 0,
      magicalDefense: 0,
    },
    sprite: "assets/sprites/items/bronze_necklace.png",
  },
  health_tonic: {
    id: "health_tonic",
    name: "Health Tonic",
    usage: "consume",
    equipSlot: null,
    buyPrice: 20,
    battleStatBonuses: {
      hp: 0,
      physicalStrength: 0,
      magicalStrength: 0,
      physicalDefense: 0,
      magicalDefense: 0,
    },
    useEffect: { type: "heal", amount: 30 },
  },
};
