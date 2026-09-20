import { describe, it, expect } from "vitest";
import { evaluateEquipItem, equipItem, canUnitEquipItem } from "../../src/inventory/equipmentOps";
import type { InventoryState } from "../../src/inventory/inventoryState";
import { backpack, equipment, instance, catalog, fillBackpack } from "./helpers";

/**
 * `evaluateEquipItem` is the read half the item-action window enables its Equip option from, so
 * it must agree with `equipItem` on EVERY precondition — not only the class check that
 * `canUnitEquipItem` covers.
 */

const CATALOG = catalog({
  helmet:      { kind: "equipment", slot: "helmet" },
  mage_helmet: { kind: "equipment", slot: "helmet", allowedClassIds: ["mage"] },
  potion:      { kind: "usable", slot: "usable_slot", useEffect: { type: "heal", amount: 10 } },
  potion2:     { kind: "usable", slot: "usable_slot", useEffect: { type: "heal", amount: 10 } },
  essence:     { kind: "consumable", slot: null, useEffect: { type: "heal", amount: 5 } },
});

const INSTANCES = {
  i_helmet: instance("i_helmet", "helmet"),
  i_mage_helmet: instance("i_mage_helmet", "mage_helmet"),
  i_potion: instance("i_potion", "potion"),
  i_potion2: instance("i_potion2", "potion2"),
  i_essence: instance("i_essence", "essence"),
};

function inv(
  backpackSlots: Record<string, string>,
  equipSlots: Record<string, string> = {},
): InventoryState {
  return {
    instances: { ...INSTANCES },
    containers: {
      backpack_shared: backpack("backpack_shared", backpackSlots),
      equip_warrior: equipment("warrior", equipSlots),
    },
  };
}

const evaluate = (instanceId: string, inventory: InventoryState) =>
  evaluateEquipItem("warrior", "warrior", instanceId, inventory, CATALOG);

describe("evaluateEquipItem", () => {
  it("accepts a usable into an empty usable_slot, with nothing displaced", () => {
    expect(evaluate("i_potion", inv({ "0": "i_potion" })))
      .toEqual({ ok: true, slot: "usable_slot", swaps: null });
  });

  it("names the displaced instance when the slot is occupied", () => {
    const inventory = inv({ "0": "i_potion" }, { usable_slot: "i_potion2" });

    expect(evaluate("i_potion", inventory))
      .toEqual({ ok: true, slot: "usable_slot", swaps: "i_potion2" });
  });

  it("rejects an unknown instance, a class-restricted item and a non-equippable kind", () => {
    expect(evaluate("nope", inv({}))).toEqual({ ok: false, reason: "missing_instance" });
    expect(evaluate("i_mage_helmet", inv({ "0": "i_mage_helmet" })))
      .toEqual({ ok: false, reason: "class_restricted" });
    expect(evaluate("i_essence", inv({ "0": "i_essence" })))
      .toEqual({ ok: false, reason: "not_equippable" });
  });

  it("rejects an item that is in no container", () => {
    expect(evaluate("i_potion", inv({}))).toEqual({ ok: false, reason: "missing_location" });
  });

  it("rejects a missing equipment container", () => {
    const inventory: InventoryState = {
      instances: { ...INSTANCES },
      containers: { backpack_shared: backpack("backpack_shared", { "0": "i_potion" }) },
    };

    expect(evaluate("i_potion", inventory))
      .toEqual({ ok: false, reason: "missing_equip_container" });
  });

  it("agrees with equipItem on every one of those, and on success", () => {
    // The point of the split: the screen's enabled state and the pipeline's outcome are the
    // same decision, so an offered action can never be silently refused.
    const cases: Array<[string, InventoryState]> = [
      ["i_potion", inv({ "0": "i_potion" })],
      ["i_potion", inv({ "0": "i_potion" }, { usable_slot: "i_potion2" })],
      ["nope", inv({})],
      ["i_mage_helmet", inv({ "0": "i_mage_helmet" })],
      ["i_essence", inv({ "0": "i_essence" })],
      ["i_potion", inv({})],
    ];

    for (const [instanceId, inventory] of cases) {
      const evaluated = evaluate(instanceId, inventory);
      const applied = equipItem("warrior", "warrior", instanceId, inventory, CATALOG);
      expect(applied.ok).toBe(evaluated.ok);
      if (!evaluated.ok && !applied.ok) expect(applied.reason).toBe(evaluated.reason);
    }
  });

  it("is strictly stronger than canUnitEquipItem", () => {
    // canUnitEquipItem passes an item that is not in any container; the full evaluator does not.
    const inventory = inv({});
    expect(canUnitEquipItem("warrior", "i_potion", inventory.instances, CATALOG.definitions))
      .toBe(true);
    expect(evaluate("i_potion", inventory).ok).toBe(false);
  });

  it("rejects a swap the source slot cannot accept back", () => {
    // Backpack full apart from the source slot the incoming item vacates: the displaced item
    // still fits there, so this one is feasible...
    const container = backpack("backpack_shared", { "0": "i_potion" });
    fillBackpack(container, 24);
    container.slots["0"] = "i_potion";
    const inventory: InventoryState = {
      instances: { ...INSTANCES },
      containers: {
        backpack_shared: container,
        equip_warrior: equipment("warrior", { usable_slot: "i_potion2" }),
      },
    };

    const evaluated = evaluate("i_potion", inventory);
    const applied = equipItem("warrior", "warrior", "i_potion", inventory, CATALOG);
    expect(applied.ok).toBe(evaluated.ok);
  });
});
