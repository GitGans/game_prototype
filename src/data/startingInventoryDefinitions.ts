export type StartingBackpackSlot =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11"
  | "12"
  | "13"
  | "14"
  | "15"
  | "16"
  | "17"
  | "18"
  | "19"
  | "20"
  | "21"
  | "22"
  | "23";

// Equipped placements carry no slot: the target slot is derived from the item's
// metadata slot (rings auto-fill ring_1 then ring_2) by resolvePreferredEquipSlot.
export type StartingItemPlacement =
  | { kind: "backpack"; slot: StartingBackpackSlot }
  | { kind: "equipped"; unitTemplateId: string };

export interface StartingItemDefinition {
  /** Stable, authored runtime id. Used directly as ItemInstance.id (NOT order-derived). */
  instanceId: string;
  itemDefinitionId: string;
  placement: StartingItemPlacement;
}

// Two rings in the shared backpack (slots 0/1), a necklace equipped on the warrior, and one of
// each permanent-stat consumable (slots 2/3). Used for BOTH campaign and debug initialization, so
// resetting a debug session restores the consumables and discards accumulated permanent bonuses.
export const CAMPAIGN_STARTING_ITEMS = [
  {
    instanceId: "item_start_bronze_ring",
    itemDefinitionId: "bronze_ring",
    placement: { kind: "backpack", slot: "0" },
  },
  {
    instanceId: "item_start_iron_ring",
    itemDefinitionId: "iron_ring",
    placement: { kind: "backpack", slot: "1" },
  },
  {
    instanceId: "item_start_bronze_necklace",
    itemDefinitionId: "bronze_necklace",
    placement: { kind: "equipped", unitTemplateId: "warrior" },
  },
  {
    instanceId: "item_start_vitality_essence",
    itemDefinitionId: "vitality_essence",
    placement: { kind: "backpack", slot: "2" },
  },
  {
    instanceId: "item_start_might_essence",
    itemDefinitionId: "might_essence",
    placement: { kind: "backpack", slot: "3" },
  },
] satisfies readonly StartingItemDefinition[];
