import { BattleStatBonuses, ItemDefinition } from '../battle/types';

const STAT_LABELS: Record<keyof BattleStatBonuses, string> = {
  hp: 'HP',
  physicalDamage: 'Physical Damage',
  magicalDamage: 'Magical Damage',
  physicalDefense: 'Physical Defense',
  magicalDefense: 'Magical Defense',
};

export function getItemDescription(def: ItemDefinition): string {
  return (Object.keys(def.battleStatBonuses) as (keyof BattleStatBonuses)[])
    .filter(key => def.battleStatBonuses[key] !== 0)
    .map(key => `+${def.battleStatBonuses[key]} ${STAT_LABELS[key]}`)
    .join('\n');
}

export const ITEM_DEFINITIONS: Record<string, ItemDefinition> = {
  bronze_ring: {
    id: 'bronze_ring',
    name: 'Bronze Ring',
    usage: 'equip',
    equipSlot: 'ring',
    buyPrice: 40,
    battleStatBonuses: { hp: 5, physicalDamage: 0, magicalDamage: 0, physicalDefense: 0, magicalDefense: 0 },
    sprite: 'assets/sprites/items/bronze_ring.png',
  },
  iron_ring: {
    id: 'iron_ring',
    name: 'Iron Ring',
    usage: 'equip',
    equipSlot: 'ring',
    buyPrice: 60,
    battleStatBonuses: { hp: 0, physicalDamage: 3, magicalDamage: 0, physicalDefense: 0, magicalDefense: 0 },
  },
  bronze_necklace: {
    id: 'bronze_necklace',
    name: 'Bronze Necklace',
    usage: 'equip',
    equipSlot: 'necklace',
    buyPrice: 50,
    allowedClasses: ['warrior', 'pikeman', 'halberdist', 'crusher'],
    battleStatBonuses: { hp: 0, physicalDamage: 0, magicalDamage: 3, physicalDefense: 0, magicalDefense: 0 },
    sprite: 'assets/sprites/items/bronze_necklace.png',
  },
  health_tonic: {
    id: 'health_tonic',
    name: 'Health Tonic',
    usage: 'consume',
    equipSlot: null,
    buyPrice: 20,
    battleStatBonuses: { hp: 0, physicalDamage: 0, magicalDamage: 0, physicalDefense: 0, magicalDefense: 0 },
    useEffect: { type: 'heal', amount: 30 },
  },
  healing_belt: {
    id: 'healing_belt',
    name: 'Healing Belt',
    usage: 'equip_and_activate',
    equipSlot: 'activatable',
    buyPrice: 120,
    battleStatBonuses: { hp: 10, physicalDamage: 0, magicalDamage: 0, physicalDefense: 0, magicalDefense: 0 },
    useEffect: { type: 'heal', amount: 50 },
  },
};
