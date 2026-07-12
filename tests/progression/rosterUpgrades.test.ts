import { describe, it, expect } from "vitest";
import { ucid } from "../../src/shared/unitTypes";
import type { UnitBlueprint, UpgradeOptionId, UnitClassId } from "../../src/shared/unitTypes";
import type { UnitShape } from "../../src/shared/gridTypes";
import type { SkillId } from "../../src/shared/skillDefinitionTypes";
import type { RosterState, PlayerUnitState } from "../../src/progression/rosterState";
import { chooseUnitUpgrade } from "../../src/progression/rosterUpgrades";

const skillId: SkillId = "test_skill" as SkillId;
const otherSkillId: SkillId = "test_skill_other" as SkillId;

const optionId5: UpgradeOptionId = "opt_5" as UpgradeOptionId;
const optionId10: UpgradeOptionId = "opt_10" as UpgradeOptionId;
const foreignOptionId: UpgradeOptionId = "opt_foreign" as UpgradeOptionId;

const baseClassId: UnitClassId = ucid("soldier");
const minimalShape: UnitShape = { offsets: [{ dr: 0, dc: 0 }] };

const blueprint: UnitBlueprint = {
  templateId: "test_unit",
  name: "Test Unit",
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
  upgradeTiers: [
    { unlocksAtLevel: 5, options: [{ id: optionId5, name: "Tier 5", skillId }] },
    { unlocksAtLevel: 10, options: [{ id: optionId10, name: "Tier 10", skillId: otherSkillId }] },
  ],
};

const otherBlueprint: UnitBlueprint = {
  ...blueprint,
  templateId: "other_unit",
  upgradeTiers: [
    { unlocksAtLevel: 5, options: [{ id: foreignOptionId, name: "Foreign", skillId }] },
  ],
};

const blueprints = [blueprint, otherBlueprint];

function unit(overrides: Partial<PlayerUnitState> = {}): PlayerUnitState {
  return {
    level: 5,
    isInCamp: false,
    lastPlacement: null,
    permanentBonuses: {},
    chosenUpgrades: {},
    lifeState: "alive",
    currentHp: null,
    ...overrides,
  };
}

function roster(units: Record<string, PlayerUnitState>): RosterState {
  return { units };
}

describe("chooseUnitUpgrade", () => {
  it("succeeds for a valid unlocked tier/option", () => {
    const r = roster({ test_unit: unit({ level: 5 }) });
    const result = chooseUnitUpgrade(r, blueprints, {
      templateId: "test_unit",
      tierId: 5,
      upgradeId: optionId5,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextRoster.units.test_unit.chosenUpgrades[5]).toBe(optionId5);
    }
  });

  it("returns unit_not_found when the roster has no state for the unit", () => {
    const r = roster({});
    const result = chooseUnitUpgrade(r, blueprints, {
      templateId: "test_unit",
      tierId: 5,
      upgradeId: optionId5,
    });
    expect(result).toEqual({ ok: false, reason: "unit_not_found" });
  });

  it("returns blueprint_not_found when no blueprint matches the unit", () => {
    const r = roster({ ghost_unit: unit() });
    const result = chooseUnitUpgrade(r, blueprints, {
      templateId: "ghost_unit",
      tierId: 5,
      upgradeId: optionId5,
    });
    expect(result).toEqual({ ok: false, reason: "blueprint_not_found" });
  });

  it("returns tier_not_found for a tier the blueprint doesn't define", () => {
    const r = roster({ test_unit: unit({ level: 20 }) });
    const result = chooseUnitUpgrade(r, blueprints, {
      templateId: "test_unit",
      tierId: 20,
      upgradeId: optionId5,
    });
    expect(result).toEqual({ ok: false, reason: "tier_not_found" });
  });

  it("returns option_not_found for an option belonging to a different unit's tier", () => {
    const r = roster({ test_unit: unit({ level: 5 }) });
    const result = chooseUnitUpgrade(r, blueprints, {
      templateId: "test_unit",
      tierId: 5,
      upgradeId: foreignOptionId,
    });
    expect(result).toEqual({ ok: false, reason: "option_not_found" });
  });

  it("returns option_not_found for an option belonging to a different tier of the same unit", () => {
    const r = roster({ test_unit: unit({ level: 10 }) });
    const result = chooseUnitUpgrade(r, blueprints, {
      templateId: "test_unit",
      tierId: 5,
      upgradeId: optionId10,
    });
    expect(result).toEqual({ ok: false, reason: "option_not_found" });
  });

  it("returns level_locked when the unit's level is below the tier's unlock level", () => {
    const r = roster({ test_unit: unit({ level: 4 }) });
    const result = chooseUnitUpgrade(r, blueprints, {
      templateId: "test_unit",
      tierId: 5,
      upgradeId: optionId5,
    });
    expect(result).toEqual({ ok: false, reason: "level_locked" });
  });

  it("returns tier_already_chosen when the tier already has a chosen upgrade", () => {
    const r = roster({ test_unit: unit({ level: 5, chosenUpgrades: { 5: optionId5 } }) });
    const result = chooseUnitUpgrade(r, blueprints, {
      templateId: "test_unit",
      tierId: 5,
      upgradeId: optionId5,
    });
    expect(result).toEqual({ ok: false, reason: "tier_already_chosen" });
  });

  it("on success, preserves references to unchanged unit records", () => {
    const otherUnit = unit({ level: 1 });
    const r = roster({ test_unit: unit({ level: 5 }), other_unit: otherUnit });
    const result = chooseUnitUpgrade(r, blueprints, {
      templateId: "test_unit",
      tierId: 5,
      upgradeId: optionId5,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextRoster.units.other_unit).toBe(otherUnit);
    }
  });

  it("on failure, does not mutate or clone the input roster", () => {
    const r = roster({ test_unit: unit({ level: 4 }) });
    const before = r.units.test_unit;
    const result = chooseUnitUpgrade(r, blueprints, {
      templateId: "test_unit",
      tierId: 5,
      upgradeId: optionId5,
    });
    expect(result.ok).toBe(false);
    expect(r.units.test_unit).toBe(before);
  });
});
