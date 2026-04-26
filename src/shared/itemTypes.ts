import type { UnitClass } from './unitTypes';

export type EquipSlot =
  | 'ring_1'
  | 'ring_2'
  | 'ring'        // item-level type only — never a container slot key
  | 'helmet'
  | 'necklace'
  | 'hand_right'
  | 'armor'
  | 'hand_left'
  | 'gloves'
  | 'belt'
  | 'boots'
  | 'artifact'
  | 'activatable';

export interface BattleStatBonuses {
  hp: number;
  physicalDamage: number;
  magicalDamage: number;
  physicalDefense: number;
  magicalDefense: number;
}

export interface MapStatBonuses {
  movementPoints?: number;
  // extend as map mechanics are confirmed
}

export type ItemUsage = 'equip' | 'consume' | 'equip_and_activate';
export type ItemUseEffectType = 'heal' | 'permanent_stat_boost';

export interface ItemUseEffect {
  type: ItemUseEffectType;
  stat?: keyof BattleStatBonuses; // used by permanent_stat_boost
  amount: number;
}

export interface ItemDefinition {
  id: string;
  name: string;
  usage: ItemUsage;
  equipSlot: EquipSlot | null;       // null = backpack-only (consumables)
  subclass?: string;
  allowedClasses?: UnitClass[];
  battleStatBonuses: BattleStatBonuses;
  mapStatBonuses?: MapStatBonuses;
  buyPrice: number;                   // sellPrice = floor(buyPrice/4), computed
  useEffect?: ItemUseEffect;          // required for consume + equip_and_activate
  sprite?: string;
}

export interface UnitActivatableAbility {
  sourceItemDefinitionId: string;
  name: string;
  useEffect: ItemUseEffect;
  usesRemaining: number; // starts at 1; set to 0 after activation
}

export interface ItemInstance {
  id: string;           // unique runtime id, e.g. 'item_001'
  definitionId: string; // references ItemDefinition.id
}

export type ContainerKind = 'backpack' | 'equipment';

export interface ItemContainer {
  id: string;               // e.g. 'backpack_tank', 'equip_tank'
  kind: ContainerKind;
  ownerTemplateId?: string;  // unit templateId; absent for shared containers (e.g. backpack_shared)
  slots: Record<string, string>;
  // Convention:
  //   backpack  → keys are '0'–'23' (sparse; absent key = empty cell)
  //   equipment → keys are EquipSlot strings, e.g. 'accessory' (absent = empty)
  // NEVER store null/undefined as a value — only set and delete keys.
}
