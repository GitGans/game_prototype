import { describe, it, expect } from "vitest";
import { ucid } from "../../src/shared/unitTypes";
import type { UnitBlueprint, UpgradeOptionId, UnitClassId } from "../../src/shared/unitTypes";
import type { UnitShape } from "../../src/shared/gridTypes";
import type { SkillId } from "../../src/shared/skillDefinitionTypes";
import { SKILLS } from "../../src/data/skills";
import { UNIT_CLASS_DEFINITIONS } from "../../src/data/units/unitClassDefinitions";
import { resolveUnitProgression } from "../../src/progression/unitProgressionResolver";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const skillKeys = Object.keys(SKILLS) as Array<keyof typeof SKILLS>;
const baseSkillId = skillKeys[0] as SkillId;
const upgradeSkillId = skillKeys[1] as SkillId;

const optionId = "test_opt_5_upgrade" as UpgradeOptionId;
const classChangingOptionId = "test_opt_5_class" as UpgradeOptionId;
const tier10OptionId = "test_opt_10_class" as UpgradeOptionId;

const soldierClassId: UnitClassId = ucid("soldier");
const warriorClassId: UnitClassId = ucid("warrior");
const guardClassId: UnitClassId = ucid("guard");

const minimalShape: UnitShape = { offsets: [{ dr: 0, dc: 0 }] };

const baseBlueprint: UnitBlueprint = {
  templateId: "test_unit",
  name: "T",
  baseClassId: soldierClassId,
  rowTrait: "front",
  hp: 10,
  physicalStrength: 1,
  magicalStrength: 0,
  physicalDefense: 0,
  magicalDefense: 0,
  dodge: 0,
  block: 0,
  level: 1,
  initiative: 1,
  shape: minimalShape,
  baseSkillId,
  spriteSheet: { path: "x.png", frameWidth: 32, frameHeight: 32, states: ["idle", "attack", "death"] },
  upgradeTiers: [
    {
      unlocksAtLevel: 5,
      options: [
        { id: optionId, name: "Skill upgrade", skillId: upgradeSkillId },
        { id: classChangingOptionId, name: "Class upgrade", classId: warriorClassId },
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        { id: tier10OptionId, name: "Tier 10 class upgrade", classId: guardClassId },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveUnitProgression", () => {
  it("1. without chosen upgrades, currentClassId equals blueprint.baseClassId", () => {
    const result = resolveUnitProgression(baseBlueprint, {});
    expect(result.currentClassId).toBe(soldierClassId);
  });

  it("2. an upgrade without classId does not change the current class", () => {
    const result = resolveUnitProgression(baseBlueprint, { 5: optionId });
    expect(result.currentClassId).toBe(soldierClassId);
  });

  it("3. an upgrade with classId changes the current class", () => {
    const result = resolveUnitProgression(baseBlueprint, { 5: classChangingOptionId });
    expect(result.currentClassId).toBe(warriorClassId);
  });

  it("4. if multiple chosen upgrades define classId, the latest tier wins", () => {
    const result = resolveUnitProgression(baseBlueprint, {
      5: classChangingOptionId,  // warriorClassId
      10: tier10OptionId,        // guardClassId — should win
    });
    expect(result.currentClassId).toBe(guardClassId);
  });

  it("5. currentClass is the definition from UNIT_CLASS_DEFINITIONS for the resolved id", () => {
    const result = resolveUnitProgression(baseBlueprint, { 5: classChangingOptionId });
    expect(result.currentClass).toBe(
      UNIT_CLASS_DEFINITIONS[warriorClassId as string as keyof typeof UNIT_CLASS_DEFINITIONS],
    );
    expect(result.currentClass.id).toBe(warriorClassId);
    expect(result.currentClass.name).toBe("Warrior");
  });

  it("6. base skill + selected upgrade skill are both present in skills", () => {
    const result = resolveUnitProgression(baseBlueprint, { 5: optionId });
    expect(result.chosenUpgrades).toHaveLength(1);
    expect(result.chosenUpgrades[0].id).toBe(optionId);
    expect(result.skills).toHaveLength(2);
    expect(result.skills.every(s => s.definitionKind === "action_skill")).toBe(true);
    expect(result.skills[0].id).toBe(baseSkillId);
    expect(result.skills[1].id).toBe(upgradeSkillId);
  });
});
