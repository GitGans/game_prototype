import { describe, it, expect } from "vitest";
import { buildBackpackSnapshot, buildEquipmentSnapshot, snapshotActivatableAbilities, BACKPACK_SLOT_COUNT } from "../../src/inventory";
import { backpack, equipment, instance, def } from "./helpers";

const defs = {
  helm: def("helm", { equipSlot: "helmet" }),
  wand: def("wand", { equipSlot: "activatable", usage: "equip_and_activate", useEffect: { type: "heal", amount: 10 } }),
  plainEquip: def("plainEquip", { equipSlot: "boots" }), // equipped but not activatable
};

describe("buildBackpackSnapshot", () => {
  it("returns a length-24 array with entries only for valid instance+definition pairs", () => {
    const containers = { backpack_shared: backpack("backpack_shared", { "0": "i_helm", "5": "orphan" }) };
    const insts = { i_helm: instance("i_helm", "helm"), orphan: instance("orphan", "missing") };
    const snap = buildBackpackSnapshot(containers, insts, defs);
    expect(snap.slots.length).toBe(BACKPACK_SLOT_COUNT);
    expect(snap.slots[0]).toEqual({ instanceId: "i_helm", definition: defs.helm });
    expect(snap.slots[5]).toBeNull(); // missing def → no entry
    expect(snap.slots[1]).toBeNull();
  });

  it("defaults to backpack_shared but accepts an explicit (e.g. debug) id", () => {
    const containers = { backpack_debug: backpack("backpack_debug", { "0": "i_helm" }) };
    const insts = { i_helm: instance("i_helm", "helm") };
    expect(buildBackpackSnapshot(containers, insts, defs).slots[0]).toBeNull(); // wrong default id
    expect(buildBackpackSnapshot(containers, insts, defs, "backpack_debug").slots[0]).toEqual({ instanceId: "i_helm", definition: defs.helm });
  });
});

describe("buildEquipmentSnapshot", () => {
  it("returns { slots: {} } when there is no equipment container", () => {
    expect(buildEquipmentSnapshot("u1", {}, {}, defs)).toEqual({ slots: {} });
  });
  it("maps occupied equipment slots to snapshot entries", () => {
    const containers = { equip_u1: equipment("u1", { helmet: "i_helm" }) };
    const insts = { i_helm: instance("i_helm", "helm") };
    expect(buildEquipmentSnapshot("u1", containers, insts, defs)).toEqual({
      slots: { helmet: { instanceId: "i_helm", definition: defs.helm } },
    });
  });
});

describe("snapshotActivatableAbilities", () => {
  it("returns only equipped equip_and_activate items with a useEffect", () => {
    const containers = { equip_u1: equipment("u1", { activatable: "i_wand", boots: "i_boots" }) };
    const insts = { i_wand: instance("i_wand", "wand"), i_boots: instance("i_boots", "plainEquip") };
    const result = snapshotActivatableAbilities("u1", containers, insts, defs);
    expect(result).toEqual([
      { sourceItemDefinitionId: "wand", name: "wand", useEffect: { type: "heal", amount: 10 }, usesRemaining: 1 },
    ]);
  });
});
