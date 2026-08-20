import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../../src/core/GameState";
import { applyCampPhaseAction } from "../../src/core/phaseHandlers/campPhaseHandler";
import { createDebugPlayerSession } from "../../src/core/debugPlayerSession";
import { initCampaignState } from "../../src/core/initCampaignState";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";
import type { DebugSessionConfig } from "../../src/core/DebugBattleState";

const UNIT_A = PLAYER_UNITS[0].templateId;

function freshCampaign() {
  return initCampaignState({
    playerUnits: PLAYER_UNITS,
    itemCatalog: ITEM_CATALOG,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    mapDefinitions: MAP_DEFINITIONS,
    initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
  });
}

function debugConfig(): DebugSessionConfig {
  return { level: 5, startingItems: CAMPAIGN_STARTING_ITEMS, initialCampUnitIds: [] };
}

describe("applyCampPhaseAction", () => {
  beforeEach(() => {
    GameState.setCampaignState(freshCampaign());
    GameState.setDebugState({
      session: createDebugPlayerSession({ config: debugConfig(), playerUnits: PLAYER_UNITS, itemCatalog: ITEM_CATALOG }),
      initialConfig: debugConfig(),
    });
  });

  it("a campaign-sourced toggle mutates only the campaign roster", () => {
    const debugBefore = GameState.getDebugState()!.session.roster;
    const before = GameState.getCampaignState().roster.units[UNIT_A].isInCamp;
    applyCampPhaseAction({ source: 'campaign', action: { type: 'toggle_camp_unit', templateId: UNIT_A } });
    expect(GameState.getCampaignState().roster.units[UNIT_A].isInCamp).toBe(!before);
    expect(GameState.getDebugState()!.session.roster).toBe(debugBefore);
  });

  it("a debug-sourced toggle mutates only the debug roster", () => {
    const campaignBefore = GameState.getCampaignState().roster;
    const before = GameState.getDebugState()!.session.roster.units[UNIT_A].isInCamp;
    applyCampPhaseAction({ source: 'debug', action: { type: 'toggle_camp_unit', templateId: UNIT_A } });
    expect(GameState.getDebugState()!.session.roster.units[UNIT_A].isInCamp).toBe(!before);
    expect(GameState.getCampaignState().roster).toBe(campaignBefore);
  });

  it("a failed domain operation does not replace roster state", () => {
    const before = GameState.getCampaignState().roster;
    applyCampPhaseAction({ source: 'campaign', action: { type: 'toggle_camp_unit', templateId: 'not_a_real_unit' } });
    expect(GameState.getCampaignState().roster).toBe(before);
  });

  it("equivalent campaign and debug rosters produce equivalent results", () => {
    const campaignResult = applyCampPhaseAction({ source: 'campaign', action: { type: 'toggle_camp_unit', templateId: UNIT_A } });
    const debugResult = applyCampPhaseAction({ source: 'debug', action: { type: 'toggle_camp_unit', templateId: UNIT_A } });
    expect(campaignResult.ok).toBe(debugResult.ok);
    if (campaignResult.ok && debugResult.ok) {
      expect(campaignResult.nextRoster.units[UNIT_A].isInCamp).toBe(debugResult.nextRoster.units[UNIT_A].isInCamp);
    }
  });

  it("returns the domain result unchanged", () => {
    const result = applyCampPhaseAction({ source: 'campaign', action: { type: 'toggle_camp_unit', templateId: 'not_a_real_unit' } });
    expect(result).toEqual({ ok: false, reason: 'unit_not_found' });
  });
});
