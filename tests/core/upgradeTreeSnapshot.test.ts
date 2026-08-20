import { describe, it, expect } from "vitest";
import { buildUpgradeTreePlayerSnapshot } from "../../src/core/upgradeTreeSnapshot";
import { PLAYER_UNITS } from "../../src/data/units";
import type { RosterState, PlayerUnitState } from "../../src/progression/rosterState";

const blueprint = PLAYER_UNITS.find(u => (u.upgradeTiers?.length ?? 0) > 0)!;
const UNIT_ID = blueprint.templateId;
const tier = blueprint.upgradeTiers![0];

function unit(overrides: Partial<PlayerUnitState> = {}): PlayerUnitState {
  return {
    level: 1,
    isInCamp: false,
    lastPlacement: null,
    permanentBonuses: {},
    chosenUpgrades: {},
    lifeState: "alive",
    currentHp: null,
    ...overrides,
  };
}

describe("buildUpgradeTreePlayerSnapshot", () => {
  it("returns the empty placeholder when the unit is missing from the roster", () => {
    const roster: RosterState = { units: {} };
    const snapshot = buildUpgradeTreePlayerSnapshot(roster, UNIT_ID);
    expect(snapshot).toEqual({ unitName: '', upgradeTiers: [] });
  });

  it("returns the empty placeholder when the templateId has no matching blueprint", () => {
    const roster: RosterState = { units: { ghost: unit() } };
    const snapshot = buildUpgradeTreePlayerSnapshot(roster, "ghost");
    expect(snapshot).toEqual({ unitName: '', upgradeTiers: [] });
  });

  it("computes isLocked from the supplied unit's actual level", () => {
    const roster: RosterState = { units: { [UNIT_ID]: unit({ level: tier.unlocksAtLevel - 1 }) } };
    const snapshot = buildUpgradeTreePlayerSnapshot(roster, UNIT_ID);
    const found = snapshot.upgradeTiers.find(t => t.tierId === tier.unlocksAtLevel);
    expect(found?.isLocked).toBe(true);
  });

  it("computes chosenUpgradeId from the supplied unit's actual chosenUpgrades", () => {
    const chosenId = tier.options[0].id;
    const roster: RosterState = {
      units: { [UNIT_ID]: unit({ level: tier.unlocksAtLevel, chosenUpgrades: { [tier.unlocksAtLevel]: chosenId } }) },
    };
    const snapshot = buildUpgradeTreePlayerSnapshot(roster, UNIT_ID);
    const found = snapshot.upgradeTiers.find(t => t.tierId === tier.unlocksAtLevel);
    expect(found?.chosenUpgradeId).toBe(chosenId);
  });

  it("equivalent campaign/debug rosters produce identical upgrade snapshots", () => {
    const roster1: RosterState = { units: { [UNIT_ID]: unit({ level: tier.unlocksAtLevel }) } };
    const roster2: RosterState = { units: { [UNIT_ID]: unit({ level: tier.unlocksAtLevel }) } };
    expect(buildUpgradeTreePlayerSnapshot(roster1, UNIT_ID)).toEqual(buildUpgradeTreePlayerSnapshot(roster2, UNIT_ID));
  });
});
