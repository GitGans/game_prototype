import { describe, it, expect } from "vitest";
import { assertStartingEquipmentClassRestrictions } from "../../src/core/startingInventoryValidation";
import type { StartingItemDefinition } from "../../src/data/startingInventoryDefinitions";
import { ucid } from "../../src/shared/unitTypes";
import type { UnitBlueprint } from "../../src/shared/unitTypes";
import type { UnitShape } from "../../src/shared/gridTypes";
import type { ItemDefinition } from "../../src/shared/itemTypes";

const shape: UnitShape = { offsets: [{ dr: 0, dc: 0 }] };

// Base class resolves to "soldier" with no chosen upgrades.
const soldier: UnitBlueprint = {
  templateId: "u1",
  name: "U1",
  baseClassId: ucid("soldier"),
  rowTrait: "front",
  hp: 10, physicalStrength: 1, magicalStrength: 0, physicalDefense: 0, magicalDefense: 0,
  dodge: 0, block: 0, level: 1, initiative: 1, shape,
};

function itemDef(id: string, allowedClassIds?: string[]): ItemDefinition {
  return {
    id, name: id, usage: "equip", equipSlot: "necklace",
    battleStatBonuses: { hp: 0, physicalStrength: 0, magicalStrength: 0, physicalDefense: 0, magicalDefense: 0 },
    buyPrice: 100,
    ...(allowedClassIds ? { allowedClassIds: allowedClassIds.map(ucid) } : {}),
  };
}

const DEFS = {
  free_neck: itemDef("free_neck"),
  soldier_neck: itemDef("soldier_neck", ["soldier"]),
  warrior_neck: itemDef("warrior_neck", ["warrior"]),
};

function run(startingItems: readonly StartingItemDefinition[]) {
  assertStartingEquipmentClassRestrictions({
    playerUnits: [soldier],
    itemDefinitions: DEFS,
    startingItems,
  });
}

describe("assertStartingEquipmentClassRestrictions", () => {
  it("passes for an unrestricted equipped item", () => {
    expect(() => run([
      { instanceId: "a", itemDefinitionId: "free_neck", placement: { kind: "equipped", unitTemplateId: "u1" } },
    ])).not.toThrow();
  });

  it("passes when allowedClassIds includes the unit's base class", () => {
    expect(() => run([
      { instanceId: "a", itemDefinitionId: "soldier_neck", placement: { kind: "equipped", unitTemplateId: "u1" } },
    ])).not.toThrow();
  });

  it("throws when allowedClassIds excludes the unit's class (guards both campaign and debug startup)", () => {
    expect(() => run([
      { instanceId: "a", itemDefinitionId: "warrior_neck", placement: { kind: "equipped", unitTemplateId: "u1" } },
    ])).toThrow(/cannot be equipped/);
  });

  it("ignores backpack placements (only equipped items are class-checked)", () => {
    expect(() => run([
      { instanceId: "a", itemDefinitionId: "warrior_neck", placement: { kind: "backpack", slot: "0" } },
    ])).not.toThrow();
  });
});
