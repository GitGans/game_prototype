import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../../src/core/GameState";
import { PlayerSessionStore } from "../../src/core/playerSessionStore";
import { createDebugPlayerSession } from "../../src/core/debugPlayerSession";
import { initCampaignState } from "../../src/core/initCampaignState";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";
import type { DebugSessionConfig } from "../../src/core/DebugBattleState";

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

function freshDebugSession() {
  return createDebugPlayerSession({ config: debugConfig(), playerUnits: PLAYER_UNITS, itemCatalog: ITEM_CATALOG });
}

describe("PlayerSessionStore", () => {
  beforeEach(() => {
    GameState.setCampaignState(freshCampaign());
    GameState.clearDebugState();
  });

  it("getSession('campaign') returns the campaign's roster and inventory", () => {
    const campaign = GameState.getCampaignState();
    const session = PlayerSessionStore.getSession('campaign');
    expect(session.roster).toBe(campaign.roster);
    expect(session.inventory).toBe(campaign.inventory);
  });

  it("getSession('debug') returns the debug session", () => {
    const session = freshDebugSession();
    GameState.setDebugState({ session, initialConfig: debugConfig() });
    expect(PlayerSessionStore.getSession('debug')).toBe(session);
  });

  it("getSession('debug') throws when debug state is not initialized", () => {
    expect(() => PlayerSessionStore.getSession('debug')).toThrow(/Debug state is not initialized/);
  });

  it("replaceInventory('campaign', ...) preserves roster, world, and money", () => {
    const before = GameState.getCampaignState();
    const nextInventory = { ...before.inventory, instances: {} };
    PlayerSessionStore.replaceInventory('campaign', nextInventory);
    const after = GameState.getCampaignState();
    expect(after.inventory).toBe(nextInventory);
    expect(after.roster).toBe(before.roster);
    expect(after.world).toBe(before.world);
    expect(after.money).toBe(before.money);
  });

  it("replaceRoster('debug', ...) preserves inventory and initialConfig", () => {
    const session = freshDebugSession();
    const config = debugConfig();
    GameState.setDebugState({ session, initialConfig: config });
    const nextRoster = { units: {} };
    PlayerSessionStore.replaceRoster('debug', nextRoster);
    const after = GameState.getDebugState()!;
    expect(after.session.roster).toBe(nextRoster);
    expect(after.session.inventory).toBe(session.inventory);
    expect(after.initialConfig).toBe(config);
  });

  it("replaceInventory('debug', ...) preserves roster and initialConfig", () => {
    const session = freshDebugSession();
    const config = debugConfig();
    GameState.setDebugState({ session, initialConfig: config });
    const nextInventory = { ...session.inventory, instances: {} };
    PlayerSessionStore.replaceInventory('debug', nextInventory);
    const after = GameState.getDebugState()!;
    expect(after.session.inventory).toBe(nextInventory);
    expect(after.session.roster).toBe(session.roster);
    expect(after.initialConfig).toBe(config);
  });

  it("campaign writes never touch debug state", () => {
    const debugSession = freshDebugSession();
    GameState.setDebugState({ session: debugSession, initialConfig: debugConfig() });
    PlayerSessionStore.replaceInventory('campaign', { instances: {}, containers: {} });
    expect(GameState.getDebugState()!.session).toBe(debugSession);
  });

  it("debug writes never touch campaign state", () => {
    const campaignBefore = GameState.getCampaignState();
    const session = freshDebugSession();
    GameState.setDebugState({ session, initialConfig: debugConfig() });
    PlayerSessionStore.replaceInventory('debug', { instances: {}, containers: {} });
    expect(GameState.getCampaignState()).toBe(campaignBefore);
  });
});
