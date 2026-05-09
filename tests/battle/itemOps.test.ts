import { describe, it, expect } from "vitest";
import { canUnitEquipItem }     from "../../src/battle/itemOps";
import { ucid }                 from "../../src/shared/unitTypes";
import type { ItemInstance, ItemDefinition } from "../../src/shared/itemTypes";

const emptyBonuses = {
  hp:               0,
  physicalStrength: 0,
  magicalStrength:  0,
  physicalDefense:  0,
  magicalDefense:   0,
};

function makeInstance(id: string, definitionId: string): Record<string, ItemInstance> {
  return { [id]: { id, definitionId } };
}

function makeDef(id: string, allowedClassIds?: ReturnType<typeof ucid>[]): Record<string, ItemDefinition> {
  return {
    [id]: {
      id,
      name:              "Test Item",
      usage:             "equip",
      equipSlot:         "ring",
      battleStatBonuses: emptyBonuses,
      buyPrice:          10,
      ...(allowedClassIds ? { allowedClassIds } : {}),
    } as ItemDefinition,
  };
}

describe("canUnitEquipItem", () => {
  const INSTANCE_ID = "item_001";
  const DEF_ID      = "test_item";

  it("no allowedClassIds — any class is allowed", () => {
    const instances   = makeInstance(INSTANCE_ID, DEF_ID);
    const definitions = makeDef(DEF_ID);
    expect(canUnitEquipItem(ucid("warrior"), INSTANCE_ID, instances, definitions)).toBe(true);
    expect(canUnitEquipItem(ucid("soldier"), INSTANCE_ID, instances, definitions)).toBe(true);
  });

  it("allowedClassIds matches currentClassId — allowed", () => {
    const instances   = makeInstance(INSTANCE_ID, DEF_ID);
    const definitions = makeDef(DEF_ID, [ucid("warrior")]);
    expect(canUnitEquipItem(ucid("warrior"), INSTANCE_ID, instances, definitions)).toBe(true);
  });

  it("allowedClassIds does not include currentClassId — denied", () => {
    // Regression guard: base class was 'warrior', but unit evolved to 'soldier' via upgrade.
    // Warrior-only equipment must be denied when checked against the resolved class.
    const instances   = makeInstance(INSTANCE_ID, DEF_ID);
    const definitions = makeDef(DEF_ID, [ucid("warrior")]);
    expect(canUnitEquipItem(ucid("soldier"), INSTANCE_ID, instances, definitions)).toBe(false);
  });
});
