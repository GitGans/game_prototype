import { describe, it, expect } from "vitest";
import {
  backpackItemClickAction, backpackItemUseAction,
  equippedItemClickAction, equippedItemUseAction,
} from "../../src/scenes/itemGestureActions";
import type { ItemSlotSnapshot } from "../../src/shared/snapshotTypes";
import type { EquipSlot, ItemRuntimeKind } from "../../src/shared/itemTypes";

const UNIT = "warrior";

function slot(kind: ItemRuntimeKind, equipSlot: EquipSlot | null): ItemSlotSnapshot {
  return {
    instanceId: `inst_${kind}`,
    // The routers read only instanceId and metadata.kind; definition content is irrelevant.
    definition: {} as ItemSlotSnapshot["definition"],
    metadata: { kind, slot: equipSlot },
  };
}

describe("backpackItemClickAction — single click", () => {
  /**
   * A usable equips on one click like ordinary gear. That is the whole point of the change: the
   * common action costs one click, and no swap intent exists because `equipItem` handles the
   * displaced occupant itself.
   */
  it("equips a usable onto the selected unit", () => {
    expect(backpackItemClickAction(slot("usable", "usable_slot"), UNIT))
      .toStrictEqual({ type: "equip_item", instanceId: "inst_usable", unitTemplateId: UNIT });
  });

  it("still equips ordinary equipment onto the selected unit", () => {
    expect(backpackItemClickAction(slot("equipment", "ring_1"), UNIT))
      .toStrictEqual({ type: "equip_item", instanceId: "inst_equipment", unitTemplateId: UNIT });
  });

  // Unchanged behaviour: a consumable is not equippable, so its single click IS the use request.
  it("still sends a consumable straight to use confirmation, from the backpack", () => {
    expect(backpackItemClickAction(slot("consumable", null), UNIT))
      .toStrictEqual({
        type: "request_use_item", instanceId: "inst_consumable", origin: "backpack",
      });
  });
});

describe("double click — use, from the origin the item is in", () => {
  it("requests a backpack use for a backpack usable", () => {
    expect(backpackItemUseAction(slot("usable", "usable_slot")))
      .toStrictEqual({ type: "request_use_item", instanceId: "inst_usable", origin: "backpack" });
  });

  it("requests an equipped use for the item in usable_slot", () => {
    expect(equippedItemUseAction(slot("usable", "usable_slot")))
      .toStrictEqual({
        type: "request_use_item", instanceId: "inst_usable", origin: "equipped_usable",
      });
  });

  /**
   * The two double-click routers differ ONLY in origin. Same instance, same gesture, two different
   * requests — which is exactly the distinction the resolver then enforces against the committed
   * verdict.
   */
  it("differs from the backpack router only in the origin it claims", () => {
    const item = slot("usable", "usable_slot");
    const fromBackpack = backpackItemUseAction(item);
    const fromSlot = equippedItemUseAction(item);

    expect(fromSlot).toStrictEqual({ ...fromBackpack, origin: "equipped_usable" });
  });
});

describe("equippedItemClickAction — single click", () => {
  it("unequips the clicked slot from the selected unit", () => {
    expect(equippedItemClickAction("usable_slot", UNIT))
      .toStrictEqual({ type: "unequip_item", unitTemplateId: UNIT, slot: "usable_slot" });
  });

  it("names whichever slot was clicked, without interpreting it", () => {
    expect(equippedItemClickAction("helmet", UNIT))
      .toStrictEqual({ type: "unequip_item", unitTemplateId: UNIT, slot: "helmet" });
  });
});
