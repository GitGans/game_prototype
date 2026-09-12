import { describe, it, expect } from "vitest";
import { backpackItemClickAction } from "../../src/scenes/backpackItemClickAction";
import type { ItemSlotSnapshot } from "../../src/shared/snapshotTypes";
import type { EquipSlot, ItemRuntimeKind } from "../../src/shared/itemTypes";

const UNIT = "warrior";

function slot(kind: ItemRuntimeKind, equipSlot: EquipSlot | null): ItemSlotSnapshot {
  return {
    instanceId: `inst_${kind}`,
    // The adapter reads only instanceId and metadata.kind; definition content is irrelevant.
    definition: {} as ItemSlotSnapshot["definition"],
    metadata: { kind, slot: equipSlot },
  };
}

describe("backpackItemClickAction", () => {
  it("routes a usable item to the Use/Equip window, never to equip or use", () => {
    expect(backpackItemClickAction(slot("usable", "usable_slot"), UNIT))
      .toStrictEqual({ type: "open_item_actions", instanceId: "inst_usable" });
  });

  it("still equips ordinary equipment onto the selected unit", () => {
    expect(backpackItemClickAction(slot("equipment", "ring_1"), UNIT))
      .toStrictEqual({ type: "equip_item", instanceId: "inst_equipment", unitTemplateId: UNIT });
  });

  it("still sends a consumable straight to use confirmation", () => {
    expect(backpackItemClickAction(slot("consumable", null), UNIT))
      .toStrictEqual({ type: "request_use_item", instanceId: "inst_consumable" });
  });
});
