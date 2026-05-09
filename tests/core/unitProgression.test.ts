import { describe, it, expect } from "vitest";
import { SKILLS } from "../../src/data/skillDefinitions";
import type { UnitBlueprint, UpgradeOptionId } from "../../src/shared/unitTypes";
import type { UnitShape } from "../../src/shared/gridTypes";
import type { SkillId } from "../../src/shared/skillDefinitionTypes";
import { resolveUnitProgression } from "../../src/core/unitProgression";

const skillKeys = Object.keys(SKILLS) as Array<keyof typeof SKILLS>;
const baseSkillId = skillKeys[0] as SkillId;
const upgradeSkillId = skillKeys[1] as SkillId;
const optionId = "test_opt_5_upgrade" as UpgradeOptionId;

const minimalShape: UnitShape = { offsets: [{ dr: 0, dc: 0 }] };

const blueprint: UnitBlueprint = {
  templateId: "arch_test_unit",
  name: "T",
  unitClass: "soldier",
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
  upgradeTiers: [{
    unlocksAtLevel: 5,
    options: [{ id: optionId, name: "U", skillId: upgradeSkillId }],
  }],
};

describe("resolveUnitProgression", () => {
  it("selects upgrade and resolves both skills when correct UpgradeOptionId is given", () => {
    const progression = resolveUnitProgression(blueprint, { 5: optionId });
    expect(progression.chosenUpgrades).toHaveLength(1);
    expect(progression.chosenUpgrades[0].id).toBe(optionId);
    expect(progression.skills).toHaveLength(2);
    expect(progression.skills.every(s => s.definitionKind === "action_skill")).toBe(true);
  });

  it("does not select upgrade when SkillId is passed instead of UpgradeOptionId", () => {
    const corrupted = upgradeSkillId as unknown as UpgradeOptionId;
    const progression = resolveUnitProgression(blueprint, { 5: corrupted });
    expect(progression.chosenUpgrades).toHaveLength(0);
    expect(progression.skills).toHaveLength(1); // base skill only
    expect(progression.skills[0].id).toBe(baseSkillId);
  });
});
