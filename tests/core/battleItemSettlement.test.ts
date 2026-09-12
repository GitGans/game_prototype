import { describe, it, expect } from "vitest";
import { settleBattleItemConsumption } from "../../src/core/battleItemSettlement";
import type { InventoryState } from "../../src/inventory";
import { backpack, equipment, instance, catalog } from "../inventory/helpers";

/**
 * The one conversion from attempt-local consumption records to a persistent inventory. Every
 * record is validated before anything is written, so a corrupted attempt leaves the session
 * untouched rather than half-settled.
 */

const CATALOG = catalog({
  potion: { kind: "usable", slot: "usable_slot", useEffect: { type: "heal", amount: 10 } },
  scroll: { kind: "usable", slot: "usable_slot", useEffect: { type: "revive" } },
  helmet: { kind: "equipment", slot: "helmet" },
});

function inventory(): InventoryState {
  return {
    instances: {
      i_potion: instance("i_potion", "potion"),
      i_scroll: instance("i_scroll", "scroll"),
      i_helmet: instance("i_helmet", "helmet"),
    },
    containers: {
      backpack_shared: backpack("backpack_shared", { "0": "i_helmet" }),
      equip_warrior: equipment("warrior", { usable_slot: "i_potion" }),
      equip_mage: equipment("mage", { usable_slot: "i_scroll" }),
    },
  };
}

const record = (instanceId: string, definitionId: string, unitTemplateId: string) =>
  ({ instanceId, definitionId, unitTemplateId });

const settle = (records: ReturnType<typeof record>[], inv = inventory()) =>
  settleBattleItemConsumption({ inventory: inv, catalog: CATALOG, records });

describe("settleBattleItemConsumption", () => {
  it("returns the inventory BY IDENTITY when nothing was consumed", () => {
    // The overwhelmingly common exit: no new object is published for an ordinary battle.
    const inv = inventory();
    const result = settle([], inv);
    if (!result.ok) throw new Error("expected success");
    expect(result.nextInventory).toBe(inv);
  });

  it("removes exactly the consumed instances, from both the slot and the registry", () => {
    const result = settle([record("i_potion", "potion", "warrior")]);
    if (!result.ok) throw new Error(`unexpected failure: ${result.failure.reason}`);

    expect(result.nextInventory.instances.i_potion).toBeUndefined();
    expect(result.nextInventory.containers.equip_warrior.slots).toEqual({});
    // Everything else survives untouched.
    expect(result.nextInventory.instances.i_scroll).toBeDefined();
    expect(result.nextInventory.containers.backpack_shared.slots).toEqual({ "0": "i_helmet" });
  });

  it("settles several records from different owners in one write", () => {
    const result = settle([
      record("i_potion", "potion", "warrior"),
      record("i_scroll", "scroll", "mage"),
    ]);
    if (!result.ok) throw new Error(`unexpected failure: ${result.failure.reason}`);

    expect(Object.keys(result.nextInventory.instances)).toEqual(["i_helmet"]);
  });

  it("rejects a duplicate record", () => {
    expect(settle([
      record("i_potion", "potion", "warrior"),
      record("i_potion", "potion", "warrior"),
    ])).toEqual({ ok: false, failure: { reason: "duplicate_record", instanceId: "i_potion" } });
  });

  it("rejects a record whose definition no longer matches the instance", () => {
    // The instance was replaced between the attempt starting and exiting.
    expect(settle([record("i_potion", "scroll", "warrior")]))
      .toEqual({ ok: false, failure: { reason: "definition_mismatch", instanceId: "i_potion" } });
  });

  it("rejects a record for an instance that no longer exists", () => {
    expect(settle([record("i_ghost", "potion", "warrior")]))
      .toEqual({ ok: false, failure: { reason: "definition_mismatch", instanceId: "i_ghost" } });
  });

  it("rejects a record whose owner does not hold the item", () => {
    expect(settle([record("i_potion", "potion", "mage")])).toEqual({
      ok: false,
      failure: { reason: "invalid_placement", instanceId: "i_potion", cause: "not_equipped_by_unit" },
    });
  });

  it("rejects an item that has moved out of usable_slot", () => {
    // No slot is stored on the record: placement is re-derived through inventory validation
    // rather than trusted across the attempt boundary.
    const moved: InventoryState = {
      instances: { i_potion: instance("i_potion", "potion") },
      containers: {
        backpack_shared: backpack("backpack_shared", { "3": "i_potion" }),
        equip_warrior: equipment("warrior"),
      },
    };

    expect(settle([record("i_potion", "potion", "warrior")], moved)).toEqual({
      ok: false,
      failure: { reason: "invalid_placement", instanceId: "i_potion", cause: "not_equipped_by_unit" },
    });
  });

  it("writes NOTHING when any record in the batch fails", () => {
    const inv = inventory();

    const result = settle([
      record("i_potion", "potion", "warrior"),   // valid
      record("i_scroll", "scroll", "warrior"),   // wrong owner
    ], inv);

    expect(result.ok).toBe(false);
    expect(inv.containers.equip_warrior.slots).toEqual({ usable_slot: "i_potion" });
    expect(inv.instances.i_potion).toBeDefined();
  });
});
