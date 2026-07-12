import { describe, it, expect } from "vitest";
import { initCampaignState } from "../../src/core/initCampaignState";
import { requireSharedBackpack } from "../../src/inventory";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";

function build() {
  return initCampaignState({
    playerUnits: PLAYER_UNITS,
    itemCatalog: ITEM_CATALOG,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    mapDefinitions: MAP_DEFINITIONS,
    initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
  });
}

describe("initCampaignState", () => {
  it("creates all player units, keyed by templateId", () => {
    const campaign = build();
    expect(Object.keys(campaign.roster.units).sort()).toEqual(
      PLAYER_UNITS.map(bp => bp.templateId).sort(),
    );
  });

  it("starts healer, shaman, and destroyer in camp; other units outside camp", () => {
    const campaign = build();
    for (const bp of PLAYER_UNITS) {
      const expected = CAMPAIGN_INITIAL_STATE_DEFINITION.initialCampUnitIds.includes(bp.templateId);
      expect(campaign.roster.units[bp.templateId].isInCamp).toBe(expected);
    }
  });

  it("initializes every unit's progression fields to their required initial values", () => {
    const campaign = build();
    for (const bp of PLAYER_UNITS) {
      const us = campaign.roster.units[bp.templateId];
      expect(us.level).toBe(bp.level);
      expect(us.lastPlacement).toBeNull();
      expect(us.permanentBonuses).toEqual({});
      expect(us.chosenUpgrades).toEqual({});
      expect(us.lifeState).toBe("alive");
      expect(us.currentHp).toBeNull();
    }
  });

  it("builds starting inventory with one shared backpack and every equipment container", () => {
    const campaign = build();
    expect(() => requireSharedBackpack(campaign.inventory)).not.toThrow();
    for (const bp of PLAYER_UNITS) {
      expect(campaign.inventory.containers[`equip_${bp.templateId}`]).toBeDefined();
    }
  });

  it("initializes a SubMapState for every map in mapDefinitions", () => {
    const campaign = build();
    expect(Object.keys(campaign.world.subMapStates).sort()).toEqual(
      Object.keys(MAP_DEFINITIONS).sort(),
    );
  });

  it("sets world.currentMapId and clones world.partyPos from the initial map's startPos", () => {
    const campaign = build();
    const initialMapDef = MAP_DEFINITIONS[CAMPAIGN_INITIAL_STATE_DEFINITION.initialMapId];
    expect(campaign.world.currentMapId).toBe(CAMPAIGN_INITIAL_STATE_DEFINITION.initialMapId);
    expect(campaign.world.partyPos).toEqual(initialMapDef.startPos);
    expect(campaign.world.partyPos).not.toBe(initialMapDef.startPos);
  });

  it("initializes money to initialMoney", () => {
    const campaign = build();
    expect(campaign.money).toBe(CAMPAIGN_INITIAL_STATE_DEFINITION.initialMoney);
  });

  it("returns independent runtime state on every call — no shared references", () => {
    const a = build();
    const b = build();
    expect(a.roster.units).not.toBe(b.roster.units);
    expect(a.roster).not.toBe(b.roster);
    expect(a.inventory.instances).not.toBe(b.inventory.instances);
    expect(a.inventory.containers).not.toBe(b.inventory.containers);
    expect(a.world.subMapStates).not.toBe(b.world.subMapStates);
    expect(a.world.partyPos).not.toBe(b.world.partyPos);
    for (const bp of PLAYER_UNITS) {
      expect(a.roster.units[bp.templateId]).not.toBe(b.roster.units[bp.templateId]);
    }
  });

  it("rejects an unknown initialMapId", () => {
    expect(() =>
      initCampaignState({
        playerUnits: PLAYER_UNITS,
        itemCatalog: ITEM_CATALOG,
        startingItems: CAMPAIGN_STARTING_ITEMS,
        mapDefinitions: MAP_DEFINITIONS,
        initialState: { ...CAMPAIGN_INITIAL_STATE_DEFINITION, initialMapId: "does_not_exist" },
      }),
    ).toThrow(/Unknown initialMapId/);
  });
});
