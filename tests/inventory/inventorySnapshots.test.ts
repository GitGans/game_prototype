import { describe, it, expect } from "vitest";
import { buildBackpackSnapshot, buildEquipmentSnapshot, BACKPACK_SLOT_COUNT } from "../../src/inventory";
import type { InventoryState } from "../../src/inventory";
import { backpack, equipment, instance, catalog } from "./helpers";

const cat = catalog({
  helm: { slot: "helmet" },
  plainEquip: { slot: "boots" },
});
const helmSlot = { definition: cat.definitions.helm, metadata: cat.metadataById.helm };

describe("buildBackpackSnapshot", () => {
  it("returns a length-24 array with entries only for valid instance+definition pairs", () => {
    const containers = { backpack_shared: backpack("backpack_shared", { "0": "i_helm", "5": "orphan" }) };
    const instances = { i_helm: instance("i_helm", "helm"), orphan: instance("orphan", "missing") };
    const snap = buildBackpackSnapshot({ containers, instances }, cat);
    expect(snap.slots.length).toBe(BACKPACK_SLOT_COUNT);
    expect(snap.slots[0]).toEqual({ instanceId: "i_helm", ...helmSlot });
    expect(snap.slots[5]).toBeNull(); // missing def → no entry
    expect(snap.slots[1]).toBeNull();
  });

  it("resolves the shared backpack structurally, regardless of its technical container id", () => {
    const containers = { backpack_debug: backpack("backpack_debug", { "0": "i_helm" }) };
    const instances = { i_helm: instance("i_helm", "helm") };
    const snap = buildBackpackSnapshot({ containers, instances }, cat);
    expect(snap.slots[0]).toEqual({ instanceId: "i_helm", ...helmSlot });
  });

  it("throws when the inventory does not contain exactly one shared backpack", () => {
    const inventory: InventoryState = { containers: {}, instances: {} };
    expect(() => buildBackpackSnapshot(inventory, cat)).toThrow();
  });
});

describe("buildEquipmentSnapshot", () => {
  it("returns { slots: {} } when there is no equipment container", () => {
    expect(buildEquipmentSnapshot("u1", { containers: {}, instances: {} }, cat)).toEqual({ slots: {} });
  });
  it("maps occupied equipment slots to snapshot entries", () => {
    const containers = { equip_u1: equipment("u1", { helmet: "i_helm" }) };
    const instances = { i_helm: instance("i_helm", "helm") };
    expect(buildEquipmentSnapshot("u1", { containers, instances }, cat)).toEqual({
      slots: { helmet: { instanceId: "i_helm", ...helmSlot } },
    });
  });
});
