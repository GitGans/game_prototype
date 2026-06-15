import { describe, it, expect } from "vitest";
import { buildStartingInventory } from "../../src/inventory";
import type { StartingItemDefinition } from "../../src/data/startingInventoryDefinitions";
import { def } from "./helpers";

const DEFS = {
  bronze_ring: def("bronze_ring", { equipSlot: "ring" }),
  bronze_necklace: def("bronze_necklace", { equipSlot: "necklace" }),
  health_tonic: def("health_tonic", { equipSlot: null, usage: "consume" }),
};

const UNITS = ["u1", "u2"] as const;

function build(startingItems: readonly StartingItemDefinition[], backpackId?: string) {
  return buildStartingInventory({
    playerUnitTemplateIds: UNITS,
    itemDefinitions: DEFS,
    startingItems,
    backpackId,
  });
}

describe("buildStartingInventory", () => {
  it("creates the backpack container and one equipment container per unit", () => {
    const { itemContainers } = build([]);
    expect(itemContainers.backpack_shared).toEqual({ id: "backpack_shared", kind: "backpack", slots: {} });
    expect(itemContainers.equip_u1).toEqual({ id: "equip_u1", kind: "equipment", ownerTemplateId: "u1", slots: {} });
    expect(itemContainers.equip_u2).toEqual({ id: "equip_u2", kind: "equipment", ownerTemplateId: "u2", slots: {} });
  });

  it("places backpack items into requested slots and uses the authored instanceId verbatim", () => {
    const { itemInstances, itemContainers } = build([
      { instanceId: "item_start_ring", itemDefinitionId: "bronze_ring", placement: { kind: "backpack", slot: "0" } },
      { instanceId: "item_start_neck", itemDefinitionId: "bronze_necklace", placement: { kind: "backpack", slot: "2" } },
    ]);
    expect(itemContainers.backpack_shared.slots).toEqual({ "0": "item_start_ring", "2": "item_start_neck" });
    expect(itemInstances.item_start_ring).toEqual({ id: "item_start_ring", definitionId: "bronze_ring" });
    expect(itemInstances.item_start_neck).toEqual({ id: "item_start_neck", definitionId: "bronze_necklace" });
  });

  it("places a non-ring equipped item into its definition slot in equip_${unitTemplateId}", () => {
    const { itemContainers } = build([
      { instanceId: "i_neck", itemDefinitionId: "bronze_necklace", placement: { kind: "equipped", unitTemplateId: "u2" } },
    ]);
    expect(itemContainers.equip_u2.slots).toEqual({ necklace: "i_neck" });
  });

  it("auto-places starting rings into ring_1 then ring_2", () => {
    const { itemContainers } = build([
      { instanceId: "r1", itemDefinitionId: "bronze_ring", placement: { kind: "equipped", unitTemplateId: "u1" } },
      { instanceId: "r2", itemDefinitionId: "bronze_ring", placement: { kind: "equipped", unitTemplateId: "u1" } },
    ]);
    expect(itemContainers.equip_u1.slots).toEqual({ ring_1: "r1", ring_2: "r2" });
  });

  it("throws when a third ring targets the same unit (no free ring slot)", () => {
    expect(() => build([
      { instanceId: "r1", itemDefinitionId: "bronze_ring", placement: { kind: "equipped", unitTemplateId: "u1" } },
      { instanceId: "r2", itemDefinitionId: "bronze_ring", placement: { kind: "equipped", unitTemplateId: "u1" } },
      { instanceId: "r3", itemDefinitionId: "bronze_ring", placement: { kind: "equipped", unitTemplateId: "u1" } },
    ])).toThrow(/No free ring slot/);
  });

  it("supports a custom backpackId", () => {
    const { itemContainers } = build(
      [{ instanceId: "i0", itemDefinitionId: "bronze_ring", placement: { kind: "backpack", slot: "0" } }],
      "backpack_debug",
    );
    expect(itemContainers.backpack_debug.slots["0"]).toBe("i0");
    expect(itemContainers.backpack_shared).toBeUndefined();
  });

  it("throws on duplicate instanceId", () => {
    expect(() => build([
      { instanceId: "dup", itemDefinitionId: "bronze_ring", placement: { kind: "backpack", slot: "0" } },
      { instanceId: "dup", itemDefinitionId: "bronze_necklace", placement: { kind: "backpack", slot: "1" } },
    ])).toThrow(/Duplicate starting item instanceId/);
  });

  it("throws on unknown itemDefinitionId", () => {
    expect(() => build([
      { instanceId: "i0", itemDefinitionId: "nope", placement: { kind: "backpack", slot: "0" } },
    ])).toThrow(/unknown itemDefinitionId/);
  });

  it("throws on an occupied backpack slot", () => {
    expect(() => build([
      { instanceId: "a", itemDefinitionId: "bronze_ring", placement: { kind: "backpack", slot: "0" } },
      { instanceId: "b", itemDefinitionId: "bronze_necklace", placement: { kind: "backpack", slot: "0" } },
    ])).toThrow(/already occupied/);
  });

  it("throws on two non-ring equipped items targeting the same slot", () => {
    expect(() => build([
      { instanceId: "a", itemDefinitionId: "bronze_necklace", placement: { kind: "equipped", unitTemplateId: "u1" } },
      { instanceId: "b", itemDefinitionId: "bronze_necklace", placement: { kind: "equipped", unitTemplateId: "u1" } },
    ])).toThrow(/already occupied/);
  });

  it("throws when an equipped item is a consumable (equipSlot null)", () => {
    expect(() => build([
      { instanceId: "c", itemDefinitionId: "health_tonic", placement: { kind: "equipped", unitTemplateId: "u1" } },
    ])).toThrow(/not equippable/);
  });

  it("throws when an equipped item targets an unknown unit", () => {
    expect(() => build([
      { instanceId: "n", itemDefinitionId: "bronze_necklace", placement: { kind: "equipped", unitTemplateId: "ghost" } },
    ])).toThrow(/unknown unit/);
  });

  it("throws on an out-of-range backpack slot", () => {
    expect(() => build([
      // cast through unknown: type rejects '24', but the builder is the runtime trust boundary
      { instanceId: "x", itemDefinitionId: "bronze_ring", placement: { kind: "backpack", slot: "24" as never } },
    ])).toThrow(/out-of-range backpack slot/);
  });

  it("does not mutate input records", () => {
    const startingItems: readonly StartingItemDefinition[] = [
      { instanceId: "i0", itemDefinitionId: "bronze_ring", placement: { kind: "backpack", slot: "0" } },
    ];
    const before = structuredClone(DEFS);
    build(startingItems);
    expect(DEFS).toEqual(before);
  });
});
