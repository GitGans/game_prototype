import { describe, it, expect } from "vitest";
import {
  BACKPACK_SLOT_COUNT,
  canPlaceItem,
  findFreeBackpackSlot,
  findItemLocation,
  moveItem,
} from "../../src/inventory";
import { backpack, equipment, instance, catalog } from "./helpers";

const defs = catalog({
  helm: { slot: "helmet" },
  ring: { slot: "ring" },
});
const insts = {
  i_helm: instance("i_helm", "helm"),
  i_ring: instance("i_ring", "ring"),
};

describe("BACKPACK_SLOT_COUNT", () => {
  it("is 24 (the corrected capacity)", () => {
    expect(BACKPACK_SLOT_COUNT).toBe(24);
  });
});

describe("canPlaceItem", () => {
  it("accepts a valid empty backpack slot", () => {
    expect(canPlaceItem("i_helm", backpack("bp"), "5", insts, defs)).toBe(true);
  });
  it("rejects an occupied slot", () => {
    expect(
      canPlaceItem(
        "i_helm",
        backpack("bp", { "5": "other" }),
        "5",
        insts,
        defs,
      ),
    ).toBe(false);
  });
  it("accepts backpack slot 23 but rejects 24", () => {
    expect(canPlaceItem("i_helm", backpack("bp"), "23", insts, defs)).toBe(
      true,
    );
    expect(canPlaceItem("i_helm", backpack("bp"), "24", insts, defs)).toBe(
      false,
    );
  });
  it("rejects an equipment slot that does not match metadata slot", () => {
    expect(canPlaceItem("i_helm", equipment("u1"), "boots", insts, defs)).toBe(
      false,
    );
    expect(canPlaceItem("i_helm", equipment("u1"), "helmet", insts, defs)).toBe(
      true,
    );
  });
  it("allows ring items into ring_1 / ring_2 only", () => {
    expect(canPlaceItem("i_ring", equipment("u1"), "ring_1", insts, defs)).toBe(
      true,
    );
    expect(canPlaceItem("i_ring", equipment("u1"), "ring_2", insts, defs)).toBe(
      true,
    );
    expect(canPlaceItem("i_ring", equipment("u1"), "helmet", insts, defs)).toBe(
      false,
    );
  });
});

describe("findFreeBackpackSlot", () => {
  it("returns slot '10' when 0..9 are occupied and 10 is free (24-slot fix)", () => {
    const bp = backpack("bp");
    for (let i = 0; i < 10; i++) bp.slots[String(i)] = `o_${i}`;
    expect(findFreeBackpackSlot(bp)).toBe("10");
  });
  it("returns null only when all 24 slots are full", () => {
    const bp = backpack("bp");
    for (let i = 0; i < BACKPACK_SLOT_COUNT; i++)
      bp.slots[String(i)] = `o_${i}`;
    expect(findFreeBackpackSlot(bp)).toBeNull();
  });
});

describe("findItemLocation", () => {
  it("locates the item across containers", () => {
    const containers = {
      bp: backpack("bp", { "3": "i_helm" }),
      equip_u1: equipment("u1"),
    };
    expect(findItemLocation("i_helm", containers)).toEqual({
      containerId: "bp",
      slotKey: "3",
    });
    expect(findItemLocation("missing", containers)).toBeNull();
  });
});

describe("moveItem", () => {
  it("moves an item and does not mutate input", () => {
    const containers = {
      bp: backpack("bp", { "0": "i_helm" }),
      equip_u1: equipment("u1"),
    };
    const before = structuredClone(containers);
    const result = moveItem(
      "i_helm",
      "bp",
      "0",
      "equip_u1",
      "helmet",
      containers,
      insts,
      defs,
    );
    expect(result.ok).toBe(true);
    expect(containers).toEqual(before); // input untouched
    if (result.ok) {
      expect(result.nextContainers.bp.slots["0"]).toBeUndefined();
      expect(result.nextContainers.equip_u1.slots["helmet"]).toBe("i_helm");
    }
  });
  it("fails with source_mismatch when the source slot does not hold the item", () => {
    const containers = { bp: backpack("bp"), equip_u1: equipment("u1") };
    const result = moveItem(
      "i_helm",
      "bp",
      "0",
      "equip_u1",
      "helmet",
      containers,
      insts,
      defs,
    );
    expect(result).toEqual({ ok: false, reason: "source_mismatch" });
  });
  it("fails with invalid_target on an occupied/incompatible target", () => {
    const containers = {
      bp: backpack("bp", { "0": "i_helm" }),
      equip_u1: equipment("u1"),
    };
    const result = moveItem(
      "i_helm",
      "bp",
      "0",
      "equip_u1",
      "boots",
      containers,
      insts,
      defs,
    );
    expect(result).toEqual({ ok: false, reason: "invalid_target" });
  });
});
