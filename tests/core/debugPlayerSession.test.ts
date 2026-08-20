import { describe, it, expect } from "vitest";
import { createDebugPlayerSession } from "../../src/core/debugPlayerSession";
import { initCampaignState } from "../../src/core/initCampaignState";
import { requireSharedBackpack } from "../../src/inventory";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";
import type { DebugSessionConfig } from "../../src/core/DebugBattleState";

function config(overrides: Partial<DebugSessionConfig> = {}): DebugSessionConfig {
  return {
    level: 5,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    initialCampUnitIds: [],
    ...overrides,
  };
}

function build(overrides: Partial<DebugSessionConfig> = {}) {
  return createDebugPlayerSession({
    config: config(overrides),
    playerUnits: PLAYER_UNITS,
    itemCatalog: ITEM_CATALOG,
  });
}

describe("createDebugPlayerSession", () => {
  it("gives every unit the configured level", () => {
    const session = build({ level: 7 });
    for (const bp of PLAYER_UNITS) {
      expect(session.roster.units[bp.templateId].level).toBe(7);
    }
  });

  it("sets isInCamp from the configured camp unit ids", () => {
    const campIds = [PLAYER_UNITS[0].templateId, PLAYER_UNITS[1].templateId];
    const session = build({ initialCampUnitIds: campIds });
    for (const bp of PLAYER_UNITS) {
      expect(session.roster.units[bp.templateId].isInCamp).toBe(campIds.includes(bp.templateId));
    }
  });

  it("initializes progression, placement, HP, and life-state fields to their required values", () => {
    const session = build();
    for (const bp of PLAYER_UNITS) {
      const us = session.roster.units[bp.templateId];
      expect(us.lastPlacement).toBeNull();
      expect(us.permanentBonuses).toEqual({});
      expect(us.chosenUpgrades).toEqual({});
      expect(us.lifeState).toBe("alive");
      expect(us.currentHp).toBeNull();
    }
  });

  it("builds a debug inventory containing exactly one shared backpack", () => {
    const session = build();
    expect(() => requireSharedBackpack(session.inventory)).not.toThrow();
  });

  it("returns independent state on every call", () => {
    const a = build();
    const b = build();
    expect(a.roster.units).not.toBe(b.roster.units);
    expect(a.inventory.containers).not.toBe(b.inventory.containers);
    expect(a.inventory.instances).not.toBe(b.inventory.instances);
    for (const bp of PLAYER_UNITS) {
      expect(a.roster.units[bp.templateId]).not.toBe(b.roster.units[bp.templateId]);
    }
  });

  it("shares no mutable roster or inventory references with a campaign built from the same content, and mutating one does not affect the other", () => {
    const campaign = initCampaignState({
      playerUnits: PLAYER_UNITS,
      itemCatalog: ITEM_CATALOG,
      startingItems: CAMPAIGN_STARTING_ITEMS,
      mapDefinitions: MAP_DEFINITIONS,
      initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
    });
    const session = build();

    expect(session.roster.units).not.toBe(campaign.roster.units);
    expect(session.inventory.containers).not.toBe(campaign.inventory.containers);
    expect(session.inventory.instances).not.toBe(campaign.inventory.instances);
    for (const bp of PLAYER_UNITS) {
      expect(session.roster.units[bp.templateId]).not.toBe(campaign.roster.units[bp.templateId]);
    }

    // Mutation is limited to this test-owned session/campaign and exists only to prove
    // reference independence.
    const templateId = PLAYER_UNITS[0].templateId;
    session.roster.units[templateId].level = 999;
    expect(campaign.roster.units[templateId].level).not.toBe(999);
  });

  it("rejects a non-integer or sub-1 level", () => {
    expect(() => build({ level: 0 })).toThrow(/level must be an integer/);
    expect(() => build({ level: 1.5 })).toThrow(/level must be an integer/);
  });
});
