import { describe, it, expect } from "vitest";
import { validateUnitDefinitionCollections } from "../../src/core/unitDefinitionValidator";
import type { UnitBlueprint, UnitRace, SpriteSheetConfig, UpgradeOptionId } from "../../src/shared/unitTypes";
import type { UnitShape } from "../../src/shared/gridTypes";
import type { ActionSkillDefinition, SkillId } from "../../src/shared/skillDefinitionTypes";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const minimalShape: UnitShape = { offsets: [{ dr: 0, dc: 0 }] };

const minimalSpriteSheet: SpriteSheetConfig = {
  path: "x.png",
  frameWidth: 32,
  frameHeight: 32,
  states: ["idle", "attack", "death"],
};

const validSkill: ActionSkillDefinition = {
  definitionKind: "action_skill",
  id: "test_skill" as SkillId,
  name: "Test",
  targetPolicy: { type: "enemy_melee" },
  actions: [],
};

const validSkills: Record<string, ActionSkillDefinition> = {
  test_skill: validSkill,
};

const validPlayerUnit: UnitBlueprint = {
  templateId: "test_player",
  name: "P",
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
  baseSkillId: "test_skill" as SkillId,
  spriteSheet: minimalSpriteSheet,
};

const validEnemyUnit: UnitBlueprint = {
  templateId: "test_enemy",
  name: "E",
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
  enemySkillUnlocks: [{ unlocksAtLevel: 0, skillId: "test_skill" as SkillId }],
  spriteSheet: minimalSpriteSheet,
};

const validEnemyUnits: Record<UnitRace, UnitBlueprint[]> = {
  orc: [validEnemyUnit],
  demon: [],
  undead: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("validateUnitDefinitionCollections", () => {
  it("accepts valid minimal player and enemy definitions", () => {
    expect(() =>
      validateUnitDefinitionCollections({
        playerUnits: [validPlayerUnit],
        enemyUnits: validEnemyUnits,
        skills: validSkills,
      })
    ).not.toThrow();
  });

  it("throws when a player baseSkillId is missing from skills", () => {
    const bad: UnitBlueprint = {
      ...validPlayerUnit,
      baseSkillId: "missing_skill" as SkillId,
    };
    expect(() =>
      validateUnitDefinitionCollections({
        playerUnits: [bad],
        enemyUnits: validEnemyUnits,
        skills: validSkills,
      })
    ).toThrow(/baseSkillId.*missing_skill/);
  });

  it("throws when an upgrade option skillId is missing from skills", () => {
    const bad: UnitBlueprint = {
      ...validPlayerUnit,
      upgradeTiers: [{
        unlocksAtLevel: 5,
        options: [{ id: "opt_1" as UpgradeOptionId, name: "X", skillId: "ghost_skill" as SkillId }],
      }],
    };
    expect(() =>
      validateUnitDefinitionCollections({
        playerUnits: [bad],
        enemyUnits: validEnemyUnits,
        skills: validSkills,
      })
    ).toThrow(/ghost_skill/);
  });

  it("throws when an enemy unlock skillId is missing from skills", () => {
    const bad: UnitBlueprint = {
      ...validEnemyUnit,
      enemySkillUnlocks: [{ unlocksAtLevel: 0, skillId: "ghost_skill" as SkillId }],
    };
    expect(() =>
      validateUnitDefinitionCollections({
        playerUnits: [validPlayerUnit],
        enemyUnits: { orc: [bad], demon: [], undead: [] },
        skills: validSkills,
      })
    ).toThrow(/ghost_skill/);
  });

  it("throws when a player unit has duplicate upgrade option IDs", () => {
    const dupId = "dup_opt" as UpgradeOptionId;
    const bad: UnitBlueprint = {
      ...validPlayerUnit,
      upgradeTiers: [
        { unlocksAtLevel: 5,  options: [{ id: dupId, name: "A", skillId: "test_skill" as SkillId }] },
        { unlocksAtLevel: 10, options: [{ id: dupId, name: "B", skillId: "test_skill" as SkillId }] },
      ],
    };
    expect(() =>
      validateUnitDefinitionCollections({
        playerUnits: [bad],
        enemyUnits: validEnemyUnits,
        skills: validSkills,
      })
    ).toThrow(/duplicate upgrade option id/);
  });
});
