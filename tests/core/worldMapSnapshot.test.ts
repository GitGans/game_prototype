import { describe, it, expect } from "vitest";
import { projectWorldMapSnapshot } from "../../src/core/worldMapProjection";
import { initCampaignState } from "../../src/core/initCampaignState";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";
import type { CampaignState } from "../../src/campaign";

// projectWorldMapSnapshot is a pure function (no Phaser, no GameState reads) — it lives in
// core/worldMapProjection.ts rather than PhaseManager.ts (which imports the real 'phaser'
// package, unusable under this project's Node-environment tests) so the world_map
// snapshot projection is unit-testable without a Phaser.Game instance.

function buildCampaign(): CampaignState {
  return initCampaignState({
    playerUnits: PLAYER_UNITS,
    itemCatalog: ITEM_CATALOG,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    mapDefinitions: MAP_DEFINITIONS,
    initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
  });
}

function withEntityStates(campaign: CampaignState, entityStates: Record<string, { alive: boolean }>): CampaignState {
  const mapId = campaign.world.currentMapId;
  return {
    ...campaign,
    world: {
      ...campaign.world,
      subMapStates: { ...campaign.world.subMapStates, [mapId]: { entityStates } },
    },
  };
}

describe("projectWorldMapSnapshot", () => {
  it("supplies mapId, partyPos, and the current map's SubMapState from CampaignState.world", () => {
    const campaign = buildCampaign();
    const snapshot = projectWorldMapSnapshot(campaign);
    expect(snapshot.mapId).toBe(campaign.world.currentMapId);
    expect(snapshot.partyPos).toEqual(campaign.world.partyPos);
    expect(snapshot.mapState.entityStates).toEqual(
      campaign.world.subMapStates[campaign.world.currentMapId].entityStates,
    );
  });

  it("does not share the entityStates record with the live campaign record", () => {
    const campaign = withEntityStates(buildCampaign(), { "2,3": { alive: false } });
    const snapshot = projectWorldMapSnapshot(campaign);
    expect(snapshot.mapState.entityStates).not.toBe(
      campaign.world.subMapStates[campaign.world.currentMapId].entityStates,
    );
  });

  it("isolates entityStates entries from campaign state in both directions", () => {
    const campaign = withEntityStates(buildCampaign(), { "1,1": { alive: true } });
    const snapshot = projectWorldMapSnapshot(campaign);

    // Mutating the snapshot's nested entity-state object must not affect campaign state.
    snapshot.mapState.entityStates["1,1"].alive = false;
    expect(campaign.world.subMapStates[campaign.world.currentMapId].entityStates["1,1"].alive).toBe(true);

    // Mutating campaign state's nested entry must not affect an already-taken snapshot.
    const snapshot2 = projectWorldMapSnapshot(campaign);
    campaign.world.subMapStates[campaign.world.currentMapId].entityStates["1,1"].alive = false;
    expect(snapshot2.mapState.entityStates["1,1"].alive).toBe(true);
  });

  it("isolates partyPos from campaign state in both directions", () => {
    const campaign = buildCampaign();
    const snapshot = projectWorldMapSnapshot(campaign);

    snapshot.partyPos.x = 999;
    expect(campaign.world.partyPos.x).not.toBe(999);

    campaign.world.partyPos.x = 111;
    expect(snapshot.partyPos.x).not.toBe(111);
  });

  it("throws when the campaign's current map is missing from subMapStates", () => {
    const campaign = buildCampaign();
    const broken: CampaignState = { ...campaign, world: { ...campaign.world, currentMapId: "does_not_exist" } };
    expect(() => projectWorldMapSnapshot(broken)).toThrow(
      'Campaign world state is missing map "does_not_exist"',
    );
  });
});
