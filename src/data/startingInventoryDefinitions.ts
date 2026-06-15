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
// equipSlot (rings auto-fill ring_1 then ring_2) by resolvePreferredEquipSlot.
export type StartingItemPlacement =
  | { kind: "backpack"; slot: StartingBackpackSlot }
  | { kind: "equipped"; unitTemplateId: string };

export interface StartingItemDefinition {
  /** Stable, authored runtime id. Used directly as ItemInstance.id (NOT order-derived). */
  instanceId: string;
  itemDefinitionId: string;
  placement: StartingItemPlacement;
}

// Keep current gameplay equivalent: three items in the shared backpack, slots 0/1/2.
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
] satisfies readonly StartingItemDefinition[];
