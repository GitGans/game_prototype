import { describe, it, expect } from "vitest";
import { buildBackpackSnapshot, buildEquipmentSnapshot, BACKPACK_SLOT_COUNT } from "../../src/inventory";
import { backpack, equipment, instance, catalog } from "./helpers";

const cat = catalog({
  helm: { slot: "helmet" },
  plainEquip: { slot: "boots" },
});
const helmSlot = { definition: cat.definitions.helm, metadata: cat.metadataById.helm };

describe("buildBackpackSnapshot", () => {
  it("returns a length-24 array with entries only for valid instance+definition pairs", () => {
    const containers = { backpack_shared: backpack("backpack_shared", { "0": "i_helm", "5": "orphan" }) };
    const insts = { i_helm: instance("i_helm", "helm"), orphan: instance("orphan", "missing") };
    const snap = buildBackpackSnapshot(containers, insts, cat);
    expect(snap.slots.length).toBe(BACKPACK_SLOT_COUNT);
    expect(snap.slots[0]).toEqual({ instanceId: "i_helm", ...helmSlot });
    expect(snap.slots[5]).toBeNull(); // missing def → no entry
    expect(snap.slots[1]).toBeNull();
  });

  it("defaults to backpack_shared but accepts an explicit (e.g. debug) id", () => {
    const containers = { backpack_debug: backpack("backpack_debug", { "0": "i_helm" }) };
    const insts = { i_helm: instance("i_helm", "helm") };
    expect(buildBackpackSnapshot(containers, insts, cat).slots[0]).toBeNull(); // wrong default id
    expect(buildBackpackSnapshot(containers, insts, cat, "backpack_debug").slots[0]).toEqual({ instanceId: "i_helm", ...helmSlot });
  });
});

describe("buildEquipmentSnapshot", () => {
  it("returns { slots: {} } when there is no equipment container", () => {
    expect(buildEquipmentSnapshot("u1", {}, {}, cat)).toEqual({ slots: {} });
  });
  it("maps occupied equipment slots to snapshot entries", () => {
    const containers = { equip_u1: equipment("u1", { helmet: "i_helm" }) };
    const insts = { i_helm: instance("i_helm", "helm") };
    expect(buildEquipmentSnapshot("u1", containers, insts, cat)).toEqual({
      slots: { helmet: { instanceId: "i_helm", ...helmSlot } },
    });
  });
});
