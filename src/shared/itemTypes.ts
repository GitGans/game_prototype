import type { UnitClassId } from './unitTypes';

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
  | 'usable_slot';

export interface BattleStatBonuses {
  hp: number;
  physicalStrength: number;
  magicalStrength: number;
  physicalDefense: number;
  magicalDefense: number;
}

/**
 * Catalog DATA ONLY. No runtime use/apply/delete mechanics exist in this stage.
 * A discriminated union keeps the contract honest (e.g. revive carries no amount);
 * mechanics will be designed later from this shape.
 */
export type ItemUseEffect =
  | { type: 'heal'; amount: number }
  | { type: 'revive' }
  | { type: 'permanent_stat_boost'; stat: keyof BattleStatBonuses; amount: number };

/**
 * Item-specific facts only. Behavior (usable/equippable) and placement (slot) are NOT
 * stored here — they are generated into ItemRuntimeMetadata from the authored item group.
 */
export interface ItemDefinition {
  id: string;
  name: string;
  /**
   * Class ids allowed to equip this item.
   * Undefined or an empty array means the item has no class restriction.
   */
  allowedClassIds?: UnitClassId[];
  battleStatBonuses: BattleStatBonuses;
  buyPrice: number;                   // sellPrice = floor(buyPrice/4), computed
  useEffect?: ItemUseEffect;          // data only — required for usable + consumable; never applied this stage
  sprite?: string;
}

/**
 * Behavior + placement generated from the authored item group (the single source of truth).
 *   equipment  → ordinary equippable gear;
 *   usable     → equippable future-use item, placed into 'usable_slot';
 *   consumable → backpack-only future-use item (not equippable).
 * `useEffect` is data only for usable/consumable — no runtime use mechanics exist yet.
 */
export type ItemRuntimeKind = 'equipment' | 'usable' | 'consumable';

export interface ItemRuntimeMetadata {
  kind: ItemRuntimeKind;
  slot: EquipSlot | null;             // null = not equippable (backpack-only)
}

export interface ItemCatalog {
  definitions: Record<string, ItemDefinition>;
  metadataById: Record<string, ItemRuntimeMetadata>;
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
