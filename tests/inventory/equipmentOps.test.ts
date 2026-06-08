import { describe, it, expect } from "vitest";
import { canUnitEquipItem, equipItem, unequipItem } from "../../src/inventory";
import { ucid } from "../../src/shared/unitTypes";
import { backpack, equipment, instance, def, fillBackpack } from "./helpers";
import { BACKPACK_SLOT_COUNT } from "../../src/inventory";

// ─── canUnitEquipItem (ported from the former itemOps unit test) ────────────────
describe("canUnitEquipItem", () => {
  const insts = { i1: instance("i1", "ring") };
  it("no allowedClassIds — any class is allowed", () => {
    const defs = { ring: def("ring", { equipSlot: "ring" }) };
    expect(canUnitEquipItem(ucid("warrior"), "i1", insts, defs)).toBe(true);
    expect(canUnitEquipItem(ucid("soldier"), "i1", insts, defs)).toBe(true);
  });
  it("allowedClassIds matches currentClassId — allowed", () => {
    const defs = { ring: def("ring", { equipSlot: "ring", allowedClassIds: ["warrior"] }) };
    expect(canUnitEquipItem(ucid("warrior"), "i1", insts, defs)).toBe(true);
  });
  it("allowedClassIds does not include currentClassId — denied (class evolution guard)", () => {
    const defs = { ring: def("ring", { equipSlot: "ring", allowedClassIds: ["warrior"] }) };
    expect(canUnitEquipItem(ucid("soldier"), "i1", insts, defs)).toBe(false);
  });
});

// ─── equipItem ──────────────────────────────────────────────────────────────────
describe("equipItem", () => {
  const defs = {
    helm: def("helm", { equipSlot: "helmet" }),
    helm2: def("helm2", { equipSlot: "helmet" }),
    ring: def("ring", { equipSlot: "ring" }),
    ring2: def("ring2", { equipSlot: "ring" }),
    warriorHelm: def("warriorHelm", { equipSlot: "helmet", allowedClassIds: ["warrior"] }),
  };

  it("simple equip returns new containers and does not mutate input", () => {
    const containers = { backpack_shared: backpack("backpack_shared", { "0": "i1" }), equip_u1: equipment("u1") };
    const insts = { i1: instance("i1", "helm") };
    const before = structuredClone(containers);
    const result = equipItem("u1", ucid("warrior"), "i1", containers, insts, defs);
    expect(result.ok).toBe(true);
    expect(containers).toEqual(before);
    if (result.ok) {
      expect(result.nextContainers.backpack_shared.slots["0"]).toBeUndefined();
      expect(result.nextContainers.equip_u1.slots["helmet"]).toBe("i1");
    }
  });

  it("rejects a class-restricted item for a disallowed class", () => {
    const containers = { backpack_shared: backpack("backpack_shared", { "0": "i1" }), equip_u1: equipment("u1") };
    const insts = { i1: instance("i1", "warriorHelm") };
    const result = equipItem("u1", ucid("soldier"), "i1", containers, insts, defs);
    expect(result.ok).toBe(false);
  });

  it("swap: equipped item returns to the source slot; identities preserved; input untouched", () => {
    const containers = {
      backpack_shared: backpack("backpack_shared", { "2": "new" }),
      equip_u1: equipment("u1", { helmet: "old" }),
    };
    const insts = { new: instance("new", "helm2"), old: instance("old", "helm") };
    const before = structuredClone(containers);
    const result = equipItem("u1", ucid("warrior"), "new", containers, insts, defs);
    expect(result.ok).toBe(true);
    expect(containers).toEqual(before);
    if (result.ok) {
      expect(result.nextContainers.equip_u1.slots["helmet"]).toBe("new");
      expect(result.nextContainers.backpack_shared.slots["2"]).toBe("old");
    }
  });

  it("ring: picks ring_1, then ring_2, then swaps ring_1 when both occupied", () => {
    const insts = { r1: instance("r1", "ring"), r2: instance("r2", "ring2"), r3: instance("r3", "ring") };

    // both empty → ring_1
    let containers: any = { backpack_shared: backpack("backpack_shared", { "0": "r1" }), equip_u1: equipment("u1") };
    let result = equipItem("u1", ucid("warrior"), "r1", containers, insts, defs);
    expect(result.ok && result.nextContainers.equip_u1.slots["ring_1"]).toBe("r1");

    // ring_1 occupied → ring_2
    containers = { backpack_shared: backpack("backpack_shared", { "0": "r2" }), equip_u1: equipment("u1", { ring_1: "r1" }) };
    result = equipItem("u1", ucid("warrior"), "r2", containers, insts, defs);
    expect(result.ok && result.nextContainers.equip_u1.slots["ring_2"]).toBe("r2");

    // both occupied → swap ring_1
    containers = { backpack_shared: backpack("backpack_shared", { "3": "r3" }), equip_u1: equipment("u1", { ring_1: "r1", ring_2: "r2" }) };
    result = equipItem("u1", ucid("warrior"), "r3", containers, insts, defs);
    expect(result.ok && result.nextContainers.equip_u1.slots["ring_1"]).toBe("r3");
    expect(result.ok && result.nextContainers.backpack_shared.slots["3"]).toBe("r1");
  });
});

// ─── unequipItem ─────────────────────────────────────────────────────────────────
describe("unequipItem", () => {
  const defs = { helm: def("helm", { equipSlot: "helmet" }) };

  it("moves the equipped item to the first free backpack slot; input untouched", () => {
    const containers = { backpack_shared: backpack("backpack_shared"), equip_u1: equipment("u1", { helmet: "i1" }) };
    const insts = { i1: instance("i1", "helm") };
    const before = structuredClone(containers);
    const result = unequipItem("u1", "helmet", containers, insts, defs);
    expect(result.ok).toBe(true);
    expect(containers).toEqual(before);
    if (result.ok) {
      expect(result.nextContainers.equip_u1.slots["helmet"]).toBeUndefined();
      expect(result.nextContainers.backpack_shared.slots["0"]).toBe("i1");
    }
  });

  it("succeeds when 0..9 are full but 10 is free (24-slot fix)", () => {
    const bp = backpack("backpack_shared");
    fillBackpack(bp, 10);
    const containers = { backpack_shared: bp, equip_u1: equipment("u1", { helmet: "i1" }) };
    const insts = { i1: instance("i1", "helm") };
    const result = unequipItem("u1", "helmet", containers, insts, defs);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nextContainers.backpack_shared.slots["10"]).toBe("i1");
  });

  it("fails with backpack_full when all 24 slots are occupied", () => {
    const bp = backpack("backpack_shared");
    fillBackpack(bp, BACKPACK_SLOT_COUNT);
    const containers = { backpack_shared: bp, equip_u1: equipment("u1", { helmet: "i1" }) };
    const insts = { i1: instance("i1", "helm") };
    const result = unequipItem("u1", "helmet", containers, insts, defs);
    expect(result).toMatchObject({ ok: false, reason: "backpack_full" });
  });

  it("fails when the equipment slot is empty", () => {
    const containers = { backpack_shared: backpack("backpack_shared"), equip_u1: equipment("u1") };
    const result = unequipItem("u1", "helmet", containers, {}, defs);
    expect(result).toMatchObject({ ok: false, reason: "slot_empty" });
  });

  // ─── Debug/campaign isolation regression (review-critical) ───────────────────
  it("debug unequip touches only the records it is given (campaign isolation)", () => {
    // Campaign and debug each have unit 'u1' with an item equipped in the SAME slot key.
    const campaign = {
      backpack_shared: backpack("backpack_shared"),
      equip_u1: equipment("u1", { helmet: "camp_item" }),
    };
    const debug = {
      backpack_debug: backpack("backpack_debug"),
      equip_u1: equipment("u1", { helmet: "debug_item" }),
    };
    const insts = { camp_item: instance("camp_item", "helm"), debug_item: instance("debug_item", "helm") };
    const campaignBefore = structuredClone(campaign);

    // Debug-context unequip: operates on DEBUG records + 'backpack_debug' only.
    const result = unequipItem("u1", "helmet", debug, insts, defs, "backpack_debug");

    expect(result.ok).toBe(true);
    expect(campaign).toEqual(campaignBefore); // campaign untouched
    if (result.ok) {
      expect(result.nextContainers.equip_u1.slots["helmet"]).toBeUndefined();
      expect(result.nextContainers.backpack_debug.slots["0"]).toBe("debug_item");
    }
  });
});
