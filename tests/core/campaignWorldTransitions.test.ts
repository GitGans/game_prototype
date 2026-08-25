import { describe, it, expect } from "vitest";
import { applyEncounterDefeatedToCampaign } from "../../src/core/campaignWorldTransitions";
import { initCampaignState } from "../../src/core/initCampaignState";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";

/**
 * `applyEncounterDefeatedToCampaign` is the pure rule behind the campaign world consequence of
 * winning a battle. It was extracted out of the coordinator, where it was the last piece of
 * inline immutable-update logic. `phaseHandlers/worldPhaseHandler.ts` decides WHEN it runs
 * (victory + campaign session); this file pins WHAT it produces.
 *
 * The immutability assertions are load-bearing, not style: campaign records are handed to the
 * snapshot builders and, eventually, to save serialization. An in-place `entityStates` write
 * would mutate state that a previously committed GamePhase may still reference.
 */

function buildCampaign() {
  return initCampaignState({
    playerUnits: PLAYER_UNITS,
    itemCatalog: ITEM_CATALOG,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    mapDefinitions: MAP_DEFINITIONS,
    initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
  });
}

describe("applyEncounterDefeatedToCampaign", () => {
  it("marks the triggering entity dead under the shared `x,y` key", () => {
    // The key format is not local convention — world/mapCompletion.ts and world/mapLogic.ts
    // read the same key space, so a divergent format silently breaks map-clear detection.
    const campaign = buildCampaign();
    const mapId = campaign.world.currentMapId;

    const next = applyEncounterDefeatedToCampaign(campaign, mapId, { x: 2, y: 2 });

    expect(next.world.subMapStates[mapId].entityStates["2,2"]).toEqual({ alive: false });
  });

  it("replaces every level of the path immutably and mutates no input", () => {
    const campaign = buildCampaign();
    const mapId = campaign.world.currentMapId;
    const sourceMap = campaign.world.subMapStates[mapId];

    const next = applyEncounterDefeatedToCampaign(campaign, mapId, { x: 3, y: 4 });

    expect(next).not.toBe(campaign);
    expect(next.world).not.toBe(campaign.world);
    expect(next.world.subMapStates).not.toBe(campaign.world.subMapStates);
    expect(next.world.subMapStates[mapId]).not.toBe(sourceMap);
    expect(next.world.subMapStates[mapId].entityStates).not.toBe(sourceMap.entityStates);
    // The original campaign must be entirely unaware of the kill.
    expect(sourceMap.entityStates["3,4"]).toBeUndefined();
  });

  it("leaves other entities and other sub-maps untouched by identity", () => {
    const campaign = buildCampaign();
    const mapId = campaign.world.currentMapId;
    const otherMapId = Object.keys(campaign.world.subMapStates).find((id) => id !== mapId);

    const next = applyEncounterDefeatedToCampaign(campaign, mapId, { x: 2, y: 2 });

    const [survivingKey] = Object.keys(campaign.world.subMapStates[mapId].entityStates)
      .filter((key) => key !== "2,2");
    if (survivingKey) {
      expect(next.world.subMapStates[mapId].entityStates[survivingKey])
        .toBe(campaign.world.subMapStates[mapId].entityStates[survivingKey]);
    }
    if (otherMapId) {
      expect(next.world.subMapStates[otherMapId]).toBe(campaign.world.subMapStates[otherMapId]);
    }
    expect(next.roster).toBe(campaign.roster);
  });

  it("returns the campaign by identity when the map has no stored state", () => {
    // Matches the coordinator's pre-extraction `if (src)` guard: an unknown map is a no-op,
    // not a thrown error and not a synthesized empty sub-map.
    const campaign = buildCampaign();

    const next = applyEncounterDefeatedToCampaign(campaign, "no_such_map", { x: 0, y: 0 });

    expect(next).toBe(campaign);
  });
});
