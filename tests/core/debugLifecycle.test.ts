import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../../src/core/GameState";
import { initializeDebugSession, resetDebugSession, clearDebugSession } from "../../src/core/debugLifecycle";
import { initCampaignState } from "../../src/core/initCampaignState";
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

function buildCampaign() {
  return initCampaignState({
    playerUnits: PLAYER_UNITS,
    itemCatalog: ITEM_CATALOG,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    mapDefinitions: MAP_DEFINITIONS,
    initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
  });
}

describe("debugLifecycle", () => {
  beforeEach(() => {
    GameState.clearDebugState();
  });

  describe("initializeDebugSession", () => {
    it("stores a session built from the given config, plus that same config as initialConfig", () => {
      const cfg = config({ level: 7 });
      initializeDebugSession(cfg);

      const state = GameState.requireDebugState();
      expect(state.initialConfig).toEqual(cfg);
      for (const bp of PLAYER_UNITS) {
        expect(state.session.roster.units[bp.templateId].level).toBe(7);
      }
    });
  });

  describe("resetDebugSession", () => {
    it("throws when no debug session exists", () => {
      expect(() => resetDebugSession()).toThrow("Debug state is not initialized");
    });

    it("discards battle-derived HP, death, placement, equipment, and level changes", () => {
      const cfg = config({ level: 3 });
      initializeDebugSession(cfg);

      const templateId = PLAYER_UNITS[0].templateId;
      const before = GameState.requireDebugState();
      GameState.setDebugState({
        ...before,
        session: {
          ...before.session,
          roster: {
            units: {
              ...before.session.roster.units,
              [templateId]: {
                ...before.session.roster.units[templateId],
                level: 99,
                lifeState: "dead",
                currentHp: 0,
                lastPlacement: { anchor: { x: 1, y: 1 } },
              },
            },
          },
        },
      });

      resetDebugSession();

      const after = GameState.requireDebugState();
      const unit = after.session.roster.units[templateId];
      expect(unit.level).toBe(3);
      expect(unit.lifeState).toBe("alive");
      expect(unit.currentHp).toBeNull();
      expect(unit.lastPlacement).toBeNull();
    });

    it("preserves the original initialConfig across the reset", () => {
      const cfg = config({ level: 4 });
      initializeDebugSession(cfg);
      resetDebugSession();
      expect(GameState.requireDebugState().initialConfig).toEqual(cfg);
    });

    it("returns a session with no shared mutable references to the previous one", () => {
      initializeDebugSession(config());
      const before = GameState.requireDebugState().session;
      resetDebugSession();
      const after = GameState.requireDebugState().session;

      expect(after.roster.units).not.toBe(before.roster.units);
      expect(after.inventory.containers).not.toBe(before.inventory.containers);
      expect(after.inventory.instances).not.toBe(before.inventory.instances);
    });

    it("leaves campaign state untouched, and campaign/debug keep independent nested roster records", () => {
      const campaign = buildCampaign();
      GameState.setCampaignState(campaign);

      initializeDebugSession(config({ level: 3 }));
      resetDebugSession();

      expect(GameState.getCampaignState()).toBe(campaign);

      const templateId = PLAYER_UNITS[0].templateId;
      const debugUnit = GameState.requireDebugState().session.roster.units[templateId];
      expect(debugUnit).not.toBe(campaign.roster.units[templateId]);

      debugUnit.level = 999;
      expect(campaign.roster.units[templateId].level).not.toBe(999);
    });
  });

  describe("clearDebugSession", () => {
    it("removes the debug state", () => {
      initializeDebugSession(config());
      clearDebugSession();
      expect(GameState.getDebugState()).toBeNull();
    });

    it("does not touch campaign state", () => {
      const campaign = buildCampaign();
      GameState.setCampaignState(campaign);
      initializeDebugSession(config());

      clearDebugSession();

      expect(GameState.getCampaignState()).toBe(campaign);
    });
  });
});
