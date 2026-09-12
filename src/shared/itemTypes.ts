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
 * `heal` is EXECUTABLE on both `usable` and `consumable`: out of combat `core/itemUse.ts` applies
 * it and destroys the source instance; in battle `battle/itemUse.ts` applies it from usable_slot.
 * `permanent_stat_boost` is executable on a `consumable`. `revive` remains catalog data only —
 * no mechanics exist for it, and every use path rejects it with `unsupported_effect`.
 */
export type ItemUseEffect =
  | { type: 'heal'; amount: number }
  | { type: 'revive' }
  | { type: 'permanent_stat_boost'; stat: keyof BattleStatBonuses; amount: number };

/**
 * Deeply-readonly effect. A plain `readonly effect: ItemUseEffect` field protects only the
 * reference — every variant's members are mutable, so a holder of a runtime resource or a render
 * snapshot could still assign `effect.amount` and bypass the exclusive runtime-write owner.
 * Every runtime resource, domain input and snapshot entry uses THIS type instead.
 *
 * `Readonly<T>` is homomorphic and distributes over the union; the variants are scalar-only, so
 * one level is sufficient. A future nested-object variant would need a deeper mapped type.
 */
export type ReadonlyItemUseEffect = Readonly<ItemUseEffect>;

/**
 * Item-use failure vocabulary. Declared here, beside `ItemUseEffect`, because several layers
 * report into one contract and none of them may import the others:
 *   inventory/itemUseOps.ts            → ItemLocationFailure
 *   progression/consumableStatBoost.ts → ItemBoostFailure
 *   progression/itemHealing.ts         → ItemHealFailure
 *   core/itemUsability.ts              → widens all three into ItemUseFailure
 */
export type ItemLocationFailure =
  | 'missing_instance'
  | 'missing_definition'
  | 'not_usable_from_here'
  | 'missing_use_effect'
  | 'not_in_backpack'
  | 'not_equipped_by_unit'
  | 'duplicate_placement';

export type ItemBoostFailure =
  | 'unit_dead'
  | 'invalid_amount'
  | 'invalid_result';

/**
 * `unit_full_hp` is specific to healing: restoring nothing is refused rather than silently
 * consuming the item. A permanent stat boost has no such rule — a full-health character may
 * still consume an essence.
 */
export type ItemHealFailure =
  | 'unit_dead'
  | 'invalid_amount'
  | 'invalid_result'
  | 'unit_full_hp';

export type ItemUseFailure =
  | ItemLocationFailure
  | ItemBoostFailure
  | ItemHealFailure
  | 'unit_not_found'
  | 'blueprint_not_found'
  | 'unsupported_effect';

/**
 * In-battle activation refusals. Declared here — not in `battle/` — because the battle render
 * snapshot (`shared/battleSnapshots.ts`) carries them, and `shared/` may not import any other
 * layer, including type-only.
 *
 * `not_manual_mode` exists because `BattleState.phase === 'select_target'` is ALSO set on
 * automatic turns; the phase alone never establishes manual player control.
 */
export type BattleItemUseFailure =
  | 'not_manual_mode'
  | 'not_awaiting_manual_action'
  | 'not_active_unit'
  | 'unit_dead'
  | 'unit_not_on_field'
  | 'instance_mismatch'
  | 'already_consumed'
  | 'unsupported_effect'
  | 'invalid_amount'
  | 'unit_full_hp';

/**
 * Equip refusals. An explicit shared vocabulary rather than a re-export of an inventory-owned
 * type, for the same reason as above: the equipment-screen snapshot carries them.
 */
export type ItemEquipFailure =
  | 'missing_instance'
  | 'missing_definition'
  | 'not_equippable'
  | 'class_restricted'
  | 'missing_equip_container'
  | 'missing_location'
  | 'missing_equipped_instance'
  | 'invalid_swap';

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
  useEffect?: ItemUseEffect;          // required for usable + consumable; executable for both
  sprite?: string;
}

/**
 * Behavior + placement generated from the authored item group (the single source of truth).
 *   equipment  → ordinary equippable gear;
 *   usable     → equippable activatable item, placed into 'usable_slot';
 *   consumable → backpack-only usable item (not equippable).
 * `useEffect` is executed for both `usable` and `consumable` — out of combat by core/itemUse.ts,
 * and for a `usable` in usable_slot during a manual battle turn by battle/itemUse.ts.
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
