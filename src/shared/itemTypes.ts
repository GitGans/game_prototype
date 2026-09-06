import type { UnitClassId, UnitBattleStatMap, UnitBattleStatDelta } from './unitTypes';

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

/**
 * Item-domain name for the canonical full battle-stat map (see unitTypes.ts —
 * UnitBattleStatMap is the source of truth; this is a domain alias, not a
 * separate type). Every canonical stat is present, default 0.
 */
export type BattleStatBonuses = UnitBattleStatMap;

/** Sparse bonus input (authoring, equipment, permanent bonuses). */
export type PartialBattleStatBonuses = UnitBattleStatDelta;

/**
 * A discriminated union keeps the contract honest (e.g. revive carries no amount).
 *
 * `permanent_stat_boost` is EXECUTABLE: `core/consumableUse.ts` applies it and destroys the
 * source instance. `heal` and `revive` remain catalog data only — no mechanics exist for them,
 * and the use operation rejects them with `unsupported_effect`.
 */
export type ItemUseEffect =
  | { type: 'heal'; amount: number }
  | { type: 'revive' }
  | { type: 'permanent_stat_boost'; stat: keyof BattleStatBonuses; amount: number };

/**
 * Consumable-use failure vocabulary. Declared here, beside `ItemUseEffect`, because three layers
 * report into one contract and none of them may import the others:
 *   inventory/consumableOps.ts   → ConsumableLocationFailure
 *   progression/consumableStatBoost.ts → ConsumableBoostFailure
 *   core/consumableUsability.ts  → widens both into ConsumableUseFailure
 */
export type ConsumableLocationFailure =
  | 'missing_instance'
  | 'missing_definition'
  | 'not_consumable'
  | 'missing_use_effect'
  | 'not_in_backpack'
  | 'duplicate_placement';

export type ConsumableBoostFailure =
  | 'unit_dead'
  | 'invalid_amount'
  | 'invalid_result';

export type ConsumableUseFailure =
  | ConsumableLocationFailure
  | ConsumableBoostFailure
  | 'unit_not_found'
  | 'blueprint_not_found'
  | 'unsupported_effect';

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
