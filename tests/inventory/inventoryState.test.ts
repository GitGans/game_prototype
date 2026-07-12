import { describe, it, expect } from "vitest";
import { requireSharedBackpack } from "../../src/inventory";
import type { InventoryState } from "../../src/inventory";
import { backpack, equipment } from "./helpers";

function inv(...containers: ReturnType<typeof backpack>[]): InventoryState {
  const record: InventoryState["containers"] = {};
  for (const c of containers) record[c.id] = c;
  return { instances: {}, containers: record };
}

describe("requireSharedBackpack", () => {
  it("returns the sole shared backpack", () => {
    const shared = backpack("backpack_shared");
    const result = requireSharedBackpack(inv(shared, equipment("u1")));
    expect(result).toBe(shared);
  });

  it("throws when no shared backpack exists", () => {
    expect(() => requireSharedBackpack(inv(equipment("u1")))).toThrow(
      "Inventory must contain exactly one shared backpack; found 0",
    );
  });

  it("throws when multiple shared backpacks exist", () => {
    expect(() =>
      requireSharedBackpack(inv(backpack("backpack_a"), backpack("backpack_b"))),
    ).toThrow("Inventory must contain exactly one shared backpack; found 2");
  });

  it("does not treat a backpack with ownerTemplateId as the shared backpack", () => {
    const ownedBackpack = { id: "backpack_u1", kind: "backpack" as const, ownerTemplateId: "u1", slots: {} };
    expect(() =>
      requireSharedBackpack({ instances: {}, containers: { backpack_u1: ownedBackpack } }),
    ).toThrow("found 0");
  });

  it("never mutates the inventory or container records", () => {
    const shared = backpack("backpack_shared", { "0": "item_1" });
    const inventory = inv(shared);
    const before = JSON.stringify(inventory);
    requireSharedBackpack(inventory);
    expect(JSON.stringify(inventory)).toBe(before);
  });
});
