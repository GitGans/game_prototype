import { describe, it, expect } from "vitest";
import {
  validateItemForUse,
  removeItemInstances,
  consumeBackpackItem,
} from "../../src/inventory/itemUseOps";
import type { InventoryState } from "../../src/inventory/inventoryState";
import { backpack, equipment, instance, catalog } from "./helpers";

const BOOST = { type: "permanent_stat_boost", stat: "hp", amount: 5 } as const;

const HEAL = { type: "heal", amount: 10 } as const;

const CATALOG = catalog({
  essence: { kind: "consumable", slot: null, useEffect: BOOST },
  potion:  { kind: "usable", slot: "usable_slot", useEffect: HEAL },
  scroll:  { kind: "usable", slot: "usable_slot", useEffect: { type: "revive", hpPercent: 30 } },
  helmet:  { kind: "equipment", slot: "helmet" },
});

const BACKPACK = { kind: "shared_backpack" } as const;
const EQUIPPED = { kind: "equipped_usable", unitTemplateId: "warrior" } as const;

/** The new API takes an object; these keep the existing cases readable. */
const fromBackpack = (instanceId: string, inventory: InventoryState, cat = CATALOG) =>
  validateItemForUse({ instanceId, inventory, catalog: cat, expected: BACKPACK });
const fromUsableSlot = (instanceId: string, inventory: InventoryState, cat = CATALOG) =>
  validateItemForUse({ instanceId, inventory, catalog: cat, expected: EQUIPPED });

function inventoryWith(slots: Record<string, string>): InventoryState {
  return {
    instances: {
      i_essence: instance("i_essence", "essence"),
      i_potion:  instance("i_potion", "potion"),
      i_scroll:  instance("i_scroll", "scroll"),
      i_helmet:  instance("i_helmet", "helmet"),
    },
    containers: { backpack_shared: backpack("backpack_shared", slots) },
  };
}

describe("validateItemForUse — shared backpack", () => {
  it("resolves a backpack consumable and its authored effect", () => {
    const result = fromBackpack("i_essence", inventoryWith({ "0": "i_essence" }));

    expect(result).toEqual({
      ok: true,
      item: {
        definition: CATALOG.definitions.essence,
        useEffect: BOOST,
        containerId: "backpack_shared",
        slotKey: "0",
      },
    });
  });

  it("rejects an unknown instance", () => {
    expect(fromBackpack("nope", inventoryWith({})))
      .toEqual({ ok: false, reason: "missing_instance" });
  });

  it("rejects an instance whose definition is absent from the catalog", () => {
    const inventory: InventoryState = {
      instances: { i_ghost: instance("i_ghost", "ghost") },
      containers: { backpack_shared: backpack("backpack_shared", { "0": "i_ghost" }) },
    };

    expect(fromBackpack("i_ghost", inventory))
      .toEqual({ ok: false, reason: "missing_definition" });
  });

  it("accepts a usable as well as a consumable — both are used from the backpack", () => {
    // The effect never decides: a `revive` scroll resolves here just as a heal potion does, and
    // is refused later, by the layer that knows which effects have mechanics.
    const potion = fromBackpack("i_potion", inventoryWith({ "0": "i_potion" }));
    expect(potion.ok && potion.item.useEffect).toEqual(HEAL);

    const scroll = fromBackpack("i_scroll", inventoryWith({ "0": "i_scroll" }));
    expect(scroll.ok).toBe(true);
  });

  it("rejects equipment, which has no use path at all", () => {
    expect(fromBackpack("i_helmet", inventoryWith({ "0": "i_helmet" })))
      .toEqual({ ok: false, reason: "not_usable_from_here" });
  });

  it("rejects a consumable authored without a useEffect", () => {
    const brokenCatalog = catalog({ essence: { kind: "consumable", slot: null } });

    expect(fromBackpack("i_essence", inventoryWith({ "0": "i_essence" }), brokenCatalog))
      .toEqual({ ok: false, reason: "missing_use_effect" });
  });

  it("rejects an instance in no container", () => {
    expect(fromBackpack("i_essence", inventoryWith({})))
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

    expect(fromBackpack("i_essence", inventory))
      .toEqual({ ok: false, reason: "not_in_backpack" });
  });

  it("rejects an instance referenced by more than one slot", () => {
    // Removal deletes the registry entry, so a second reference would be left dangling —
    // contradicting the guarantee that a consumed item exists in no slot.
    const inventory = inventoryWith({ "0": "i_essence", "1": "i_essence" });

    expect(fromBackpack("i_essence", inventory))
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

    expect(fromBackpack("i_essence", inventory))
      .toEqual({ ok: false, reason: "duplicate_placement" });
  });
});

describe("consumeBackpackItem", () => {
  it("clears exactly one slot and drops exactly one registry entry", () => {
    const inventory = inventoryWith({ "0": "i_helmet", "3": "i_essence", "4": "i_potion" });

    const result = consumeBackpackItem("i_essence", inventory, CATALOG);
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);

    const next = result.nextInventory;
    expect(Object.keys(next.instances).sort()).toEqual(["i_helmet", "i_potion", "i_scroll"]);
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

describe("validateItemForUse — equipped usable_slot", () => {
  function equipped(slots: Record<string, string>): InventoryState {
    return {
      instances: {
        i_potion: instance("i_potion", "potion"),
        i_essence: instance("i_essence", "essence"),
        i_helmet: instance("i_helmet", "helmet"),
      },
      containers: {
        backpack_shared: backpack("backpack_shared"),
        equip_warrior: equipment("warrior", slots),
      },
    };
  }

  it("resolves a usable held in the owner's usable_slot", () => {
    const result = fromUsableSlot("i_potion", equipped({ usable_slot: "i_potion" }));

    expect(result).toEqual({
      ok: true,
      item: {
        definition: CATALOG.definitions.potion,
        useEffect: HEAL,
        containerId: "equip_warrior",
        slotKey: "usable_slot",
      },
    });
  });

  it("rejects a usable sitting in some other equipment slot", () => {
    // The caller cannot name the slot, so a misplaced item can never authorize its own
    // consumption — the only activation slot is usable_slot, derived here.
    expect(fromUsableSlot("i_potion", equipped({ helmet: "i_potion" })))
      .toEqual({ ok: false, reason: "not_equipped_by_unit" });
  });

  it("rejects a usable equipped by a different character", () => {
    const inventory: InventoryState = {
      instances: { i_potion: instance("i_potion", "potion") },
      containers: {
        backpack_shared: backpack("backpack_shared"),
        equip_warrior: equipment("warrior"),
        equip_mage: equipment("mage", { usable_slot: "i_potion" }),
      },
    };

    expect(fromUsableSlot("i_potion", inventory))
      .toEqual({ ok: false, reason: "not_equipped_by_unit" });
  });

  it("rejects a usable still in the backpack", () => {
    const inventory: InventoryState = {
      instances: { i_potion: instance("i_potion", "potion") },
      containers: {
        backpack_shared: backpack("backpack_shared", { "0": "i_potion" }),
        equip_warrior: equipment("warrior"),
      },
    };

    expect(fromUsableSlot("i_potion", inventory))
      .toEqual({ ok: false, reason: "not_equipped_by_unit" });
  });

  it("rejects a non-usable kind even when placed in usable_slot", () => {
    // Metadata compatibility, not a caller assertion: a consumable's group never places it here.
    expect(fromUsableSlot("i_essence", equipped({ usable_slot: "i_essence" })))
      .toEqual({ ok: false, reason: "not_usable_from_here" });
  });
});

describe("removeItemInstances", () => {
  function mixed(): InventoryState {
    return {
      instances: {
        i_potion: instance("i_potion", "potion"),
        i_scroll: instance("i_scroll", "scroll"),
        i_essence: instance("i_essence", "essence"),
      },
      containers: {
        backpack_shared: backpack("backpack_shared", { "2": "i_essence" }),
        equip_warrior: equipment("warrior", { usable_slot: "i_potion" }),
        equip_mage: equipment("mage", { usable_slot: "i_scroll" }),
      },
    };
  }

  it("removes several instances from different containers in one write", () => {
    const result = removeItemInstances({
      requests: [
        { instanceId: "i_potion", expected: EQUIPPED },
        { instanceId: "i_scroll", expected: { kind: "equipped_usable", unitTemplateId: "mage" } },
      ],
      inventory: mixed(),
      catalog: CATALOG,
    });
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);

    expect(Object.keys(result.nextInventory.instances)).toEqual(["i_essence"]);
    expect(result.nextInventory.containers.equip_warrior.slots).toEqual({});
    expect(result.nextInventory.containers.equip_mage.slots).toEqual({});
  });

  it("validates the WHOLE batch before writing anything", () => {
    const inventory = mixed();

    const result = removeItemInstances({
      requests: [
        { instanceId: "i_potion", expected: EQUIPPED },
        // Second request is misplaced — the first must not have been applied.
        { instanceId: "i_scroll", expected: EQUIPPED },
      ],
      inventory,
      catalog: CATALOG,
    });

    expect(result).toEqual({ ok: false, reason: "not_equipped_by_unit", instanceId: "i_scroll" });
    expect(inventory.containers.equip_warrior.slots).toEqual({ usable_slot: "i_potion" });
  });

  it("rejects the same instance twice rather than deleting it twice", () => {
    // Every request validates against the ORIGINAL inventory, so a duplicate would otherwise
    // succeed twice and drop a registry entry a later removal still expects.
    const result = removeItemInstances({
      requests: [
        { instanceId: "i_potion", expected: EQUIPPED },
        { instanceId: "i_potion", expected: EQUIPPED },
      ],
      inventory: mixed(),
      catalog: CATALOG,
    });

    expect(result).toEqual({ ok: false, reason: "duplicate_placement", instanceId: "i_potion" });
  });

  it("is a no-op for an empty batch", () => {
    const result = removeItemInstances({ requests: [], inventory: mixed(), catalog: CATALOG });
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);

    expect(Object.keys(result.nextInventory.instances).sort())
      .toEqual(["i_essence", "i_potion", "i_scroll"]);
  });
});
