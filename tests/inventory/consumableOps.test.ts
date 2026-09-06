import { describe, it, expect } from "vitest";
import {
  validateBackpackConsumable,
  consumeBackpackItem,
} from "../../src/inventory/consumableOps";
import type { InventoryState } from "../../src/inventory/inventoryState";
import { backpack, equipment, instance, catalog } from "./helpers";

const BOOST = { type: "permanent_stat_boost", stat: "hp", amount: 5 } as const;

const CATALOG = catalog({
  essence: { kind: "consumable", slot: null, useEffect: BOOST },
  potion:  { kind: "usable", slot: "usable_slot", useEffect: { type: "revive" } },
  helmet:  { kind: "equipment", slot: "helmet" },
});

function inventoryWith(slots: Record<string, string>): InventoryState {
  return {
    instances: {
      i_essence: instance("i_essence", "essence"),
      i_potion:  instance("i_potion", "potion"),
      i_helmet:  instance("i_helmet", "helmet"),
    },
    containers: { backpack_shared: backpack("backpack_shared", slots) },
  };
}

describe("validateBackpackConsumable", () => {
  it("resolves a backpack consumable and its authored effect", () => {
    const result = validateBackpackConsumable("i_essence", inventoryWith({ "0": "i_essence" }), CATALOG);

    expect(result).toEqual({
      ok: true,
      consumable: {
        definition: CATALOG.definitions.essence,
        useEffect: BOOST,
        containerId: "backpack_shared",
        slotKey: "0",
      },
    });
  });

  it("rejects an unknown instance", () => {
    expect(validateBackpackConsumable("nope", inventoryWith({}), CATALOG))
      .toEqual({ ok: false, reason: "missing_instance" });
  });

  it("rejects an instance whose definition is absent from the catalog", () => {
    const inventory: InventoryState = {
      instances: { i_ghost: instance("i_ghost", "ghost") },
      containers: { backpack_shared: backpack("backpack_shared", { "0": "i_ghost" }) },
    };

    expect(validateBackpackConsumable("i_ghost", inventory, CATALOG))
      .toEqual({ ok: false, reason: "missing_definition" });
  });

  it("rejects a non-consumable, even one carrying a useEffect", () => {
    // `usable` items also declare a useEffect; kind, not the effect, decides.
    expect(validateBackpackConsumable("i_potion", inventoryWith({ "0": "i_potion" }), CATALOG))
      .toEqual({ ok: false, reason: "not_consumable" });
    expect(validateBackpackConsumable("i_helmet", inventoryWith({ "0": "i_helmet" }), CATALOG))
      .toEqual({ ok: false, reason: "not_consumable" });
  });

  it("rejects a consumable authored without a useEffect", () => {
    const brokenCatalog = catalog({ essence: { kind: "consumable", slot: null } });

    expect(validateBackpackConsumable("i_essence", inventoryWith({ "0": "i_essence" }), brokenCatalog))
      .toEqual({ ok: false, reason: "missing_use_effect" });
  });

  it("rejects an instance in no container", () => {
    expect(validateBackpackConsumable("i_essence", inventoryWith({}), CATALOG))
      .toEqual({ ok: false, reason: "not_in_backpack" });
  });

  it("rejects an instance held outside the shared backpack", () => {
    const inventory: InventoryState = {
      instances: { i_essence: instance("i_essence", "essence") },
      containers: {
        backpack_shared: backpack("backpack_shared"),
        equip_warrior: equipment("warrior", { helmet: "i_essence" }),
      },
    };

    expect(validateBackpackConsumable("i_essence", inventory, CATALOG))
      .toEqual({ ok: false, reason: "not_in_backpack" });
  });

  it("rejects an instance referenced by more than one slot", () => {
    // Removal deletes the registry entry, so a second reference would be left dangling —
    // contradicting the guarantee that a consumed item exists in no slot.
    const inventory = inventoryWith({ "0": "i_essence", "1": "i_essence" });

    expect(validateBackpackConsumable("i_essence", inventory, CATALOG))
      .toEqual({ ok: false, reason: "duplicate_placement" });
  });

  it("rejects a duplicate reference spanning two containers", () => {
    const inventory: InventoryState = {
      instances: { i_essence: instance("i_essence", "essence") },
      containers: {
        backpack_shared: backpack("backpack_shared", { "0": "i_essence" }),
        equip_warrior: equipment("warrior", { helmet: "i_essence" }),
      },
    };

    expect(validateBackpackConsumable("i_essence", inventory, CATALOG))
      .toEqual({ ok: false, reason: "duplicate_placement" });
  });
});

describe("consumeBackpackItem", () => {
  it("clears exactly one slot and drops exactly one registry entry", () => {
    const inventory = inventoryWith({ "0": "i_helmet", "3": "i_essence", "4": "i_potion" });

    const result = consumeBackpackItem("i_essence", inventory, CATALOG);
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);

    const next = result.nextInventory;
    expect(Object.keys(next.instances).sort()).toEqual(["i_helmet", "i_potion"]);
    expect(next.containers.backpack_shared.slots).toEqual({ "0": "i_helmet", "4": "i_potion" });
  });

  it("leaves the consumed id in no container slot of any container", () => {
    const inventory: InventoryState = {
      instances: { i_essence: instance("i_essence", "essence") },
      containers: {
        backpack_shared: backpack("backpack_shared", { "7": "i_essence" }),
        equip_warrior: equipment("warrior"),
      },
    };

    const result = consumeBackpackItem("i_essence", inventory, CATALOG);
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);

    const stillReferenced = Object.values(result.nextInventory.containers).some(container =>
      Object.values(container.slots).includes("i_essence"),
    );
    expect(stillReferenced).toBe(false);
  });

  it("never mutates the inventory or container records", () => {
    const inventory = inventoryWith({ "0": "i_essence" });
    const instancesBefore = { ...inventory.instances };
    const slotsBefore = { ...inventory.containers.backpack_shared.slots };

    consumeBackpackItem("i_essence", inventory, CATALOG);

    expect(inventory.instances).toEqual(instancesBefore);
    expect(inventory.containers.backpack_shared.slots).toEqual(slotsBefore);
  });

  it("forwards the validation failure and changes nothing", () => {
    const inventory = inventoryWith({ "0": "i_essence", "1": "i_essence" });

    expect(consumeBackpackItem("i_essence", inventory, CATALOG))
      .toEqual({ ok: false, reason: "duplicate_placement" });
    expect(inventory.containers.backpack_shared.slots).toEqual({ "0": "i_essence", "1": "i_essence" });
    expect(inventory.instances.i_essence).toBeDefined();
  });
});
