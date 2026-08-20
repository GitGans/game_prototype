import { describe, it, expect } from "vitest";
import { applyMovePartyToCampaign } from "../../src/core/worldMapProjection";
import { initCampaignState } from "../../src/core/initCampaignState";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";

// applyMovePartyToCampaign is the pure function behind PhaseManager's `move_party` side
// effect (applyActionSideEffects calls it and stores the result via GameState.setCampaignState).
// It lives outside PhaseManager.ts (which imports the real 'phaser' package, unusable under
// this project's Node-environment tests), so the state-update logic is unit-testable directly.

function buildCampaign() {
  return initCampaignState({
    playerUnits: PLAYER_UNITS,
    itemCatalog: ITEM_CATALOG,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    mapDefinitions: MAP_DEFINITIONS,
    initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
  });
}

describe("applyMovePartyToCampaign", () => {
  it("updates world.partyPos to the given position", () => {
    const campaign = buildCampaign();
    const next = applyMovePartyToCampaign(campaign, { x: 3, y: 7 });
    expect(next.world.partyPos).toEqual({ x: 3, y: 7 });
  });

  it("does not change currentMapId or mutate the original campaign", () => {
    const campaign = buildCampaign();
    const originalMapId = campaign.world.currentMapId;
    const next = applyMovePartyToCampaign(campaign, { x: 3, y: 7 });
    expect(next.world.currentMapId).toBe(originalMapId);
    expect(campaign.world.partyPos).not.toEqual({ x: 3, y: 7 });
  });

  it("clones the given partyPos rather than storing the caller's reference", () => {
    const campaign = buildCampaign();
    const partyPos = { x: 1, y: 2 };
    const next = applyMovePartyToCampaign(campaign, partyPos);

    expect(next.world.partyPos).not.toBe(partyPos);

    // Mutating the caller's original object after the call must not affect stored state —
    // this is the assertion that actually catches a missing clone on the action→campaign
    // boundary (a realistic risk: a caller reusing a scratch coordinate object across calls).
    partyPos.x = 999;
    expect(next.world.partyPos.x).toBe(1);
  });
});
