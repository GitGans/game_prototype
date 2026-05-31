import { describe, it, expect } from "vitest";
import { ucid } from "../../src/shared/unitTypes";
import type { UnitBlueprint, UpgradeOptionId, UnitClassId } from "../../src/shared/unitTypes";
import type { UnitShape } from "../../src/shared/gridTypes";
import type { SkillId } from "../../src/shared/skillDefinitionTypes";
import { resolveUnitProgression } from "../../src/progression/unitProgressionResolver";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

// resolveUnitProgression performs global SKILLS / UNIT_CLASS_DEFINITIONS
// lookups, so we use real registry IDs. Variable names are deliberately
// generic — this test asserts resolver structure, not specific content.
const baseSkillId: SkillId    = "p_melee_basic" as SkillId;
const upgradeSkillId: SkillId = "m_heal_basic"  as SkillId;

const optionId = "test_opt_5_upgrade" as UpgradeOptionId;
const classChangingOptionId = "test_opt_5_class" as UpgradeOptionId;
const tier10OptionId = "test_opt_10_class" as UpgradeOptionId;

const baseClassId: UnitClassId          = ucid("soldier");
const firstUpgradeClassId: UnitClassId  = ucid("warrior");
const secondUpgradeClassId: UnitClassId = ucid("guard");

const minimalShape: UnitShape = { offsets: [{ dr: 0, dc: 0 }] };

const baseBlueprint: UnitBlueprint = {
  templateId: "test_unit",
  name: "T",
  baseClassId,
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
        { id: classChangingOptionId, name: "Class upgrade", classId: firstUpgradeClassId },
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        { id: tier10OptionId, name: "Tier 10 class upgrade", classId: secondUpgradeClassId },
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
    expect(result.currentClassId).toBe(baseClassId);
  });

  it("2. an upgrade without classId does not change the current class", () => {
    const result = resolveUnitProgression(baseBlueprint, { 5: optionId });
    expect(result.currentClassId).toBe(baseClassId);
  });

  it("3. an upgrade with classId changes the current class", () => {
    const result = resolveUnitProgression(baseBlueprint, { 5: classChangingOptionId });
    expect(result.currentClassId).toBe(firstUpgradeClassId);
  });

  it("4. if multiple chosen upgrades define classId, the latest tier wins", () => {
    const result = resolveUnitProgression(baseBlueprint, {
      5: classChangingOptionId,
      10: tier10OptionId,
    });
    expect(result.currentClassId).toBe(secondUpgradeClassId);
  });

  it("5. resolved currentClass.id matches the chosen upgrade classId", () => {
    const result = resolveUnitProgression(baseBlueprint, { 5: classChangingOptionId });
    expect(result.currentClass.id).toBe(firstUpgradeClassId);
  });

  it("6. base skill + selected upgrade skill are both present in skills", () => {
    const result = resolveUnitProgression(baseBlueprint, { 5: optionId });
    expect(result.chosenUpgrades).toHaveLength(1);
    expect(result.chosenUpgrades[0].id).toBe(optionId);
    expect(result.skills).toHaveLength(2);
    expect(result.skills.every(s => Array.isArray(s.actions))).toBe(true);
    expect(result.skills[0].id).toBe(baseSkillId);
    expect(result.skills[1].id).toBe(upgradeSkillId);
  });
});
