import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../../src/core/GameState";
import { PlayerSessionStore } from "../../src/core/playerSessionStore";
import {
  beginItemUseConfirmation,
  clearItemInteractionIfPresent,
  teardownItemInteractionAfterTransition,
  applyItemUsePhaseAction,
} from "../../src/core/phaseHandlers/itemUsePhaseHandler";
import { readItemInteractionForPhase } from "../../src/core/itemInteractionAccess";
import { clearItemInteractionSlot } from "../../src/core/itemInteractionStorage";
import { createDebugPlayerSession } from "../../src/core/debugPlayerSession";
import { initCampaignState } from "../../src/core/initCampaignState";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";
import { EMPTY_BACKPACK_SNAPSHOT, EMPTY_EQUIP_SNAPSHOT } from "../../src/core/phases";
import type { GamePhase } from "../../src/core/phases";
import type { PlayerSessionSource } from "../../src/core/playerSessionState";
import type { DebugSessionConfig } from "../../src/core/DebugBattleState";

const UNIT_ID = "warrior";
const VITALITY = "item_start_vitality_essence";
const MIGHT = "item_start_might_essence";

function debugConfig(): DebugSessionConfig {
  return { level: 5, startingItems: CAMPAIGN_STARTING_ITEMS, initialCampUnitIds: [] };
}

function equipPhaseFor(source: PlayerSessionSource, selected = UNIT_ID): GamePhase {
  const shared = {
    selectedUnitTemplateId: selected,
    selectedUnitSpriteKey: null,
    selectedUnit: null,
    availableUnits: [],
    backpack: EMPTY_BACKPACK_SNAPSHOT,
    unitEquipment: EMPTY_EQUIP_SNAPSHOT,
    unitStats: null,
    learnedSkills: [],
    upgradeSkills: [],
    itemUsage: {},
    pendingItemUsePrompt: null,
  };
  return source === "campaign"
    ? { type: "equip_screen", sessionSource: "campaign", returnPhase: { type: "main_menu" }, ...shared }
    : {
        type: "debug_equip_screen", sessionSource: "debug",
        campUnitIds: [], selectedForBattleUnitCount: 0,
        activeLivingUnitCount: 0, canStartBattle: false, ...shared,
      };
}

beforeEach(() => {
  GameState.setCampaignState(initCampaignState({
    playerUnits: PLAYER_UNITS,
    itemCatalog: ITEM_CATALOG,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    mapDefinitions: MAP_DEFINITIONS,
    initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
  }));
  GameState.setDebugState({
    session: createDebugPlayerSession({
      config: debugConfig(), playerUnits: PLAYER_UNITS, itemCatalog: ITEM_CATALOG,
    }),
    initialConfig: debugConfig(),
  });
  clearItemInteractionSlot("campaign");
  clearItemInteractionSlot("debug");
});

function commit(source: PlayerSessionSource, instanceId = VITALITY): void {
  beginItemUseConfirmation({ source, instanceId, unitTemplateId: UNIT_ID });
  applyItemUsePhaseAction({
    previousPhase: equipPhaseFor(source),
    action: { type: "confirm_use_item", instanceId, unitTemplateId: UNIT_ID },
  });
}

describe("confirmation lifecycle", () => {
  it("files a request under the equip screen's own session", () => {
    beginItemUseConfirmation({ source: "debug", instanceId: VITALITY, unitTemplateId: UNIT_ID });

    expect(readItemInteractionForPhase(equipPhaseFor("debug")))
      .toEqual({ kind: "confirming_use", instanceId: VITALITY, unitTemplateId: UNIT_ID });
    expect(readItemInteractionForPhase(equipPhaseFor("campaign"))).toBeNull();
  });

  it("clears one owner and leaves the other alone", () => {
    beginItemUseConfirmation({ source: "campaign", instanceId: VITALITY, unitTemplateId: UNIT_ID });
    beginItemUseConfirmation({ source: "debug", instanceId: VITALITY, unitTemplateId: UNIT_ID });

    clearItemInteractionIfPresent("campaign");

    expect(readItemInteractionForPhase(equipPhaseFor("campaign"))).toBeNull();
    expect(readItemInteractionForPhase(equipPhaseFor("debug"))).not.toBeNull();
  });

  it("is idempotent with nothing pending", () => {
    expect(() => clearItemInteractionIfPresent("campaign")).not.toThrow();
  });
});

describe("teardownItemInteractionAfterTransition", () => {
  it("keeps the request while the same screen shows the same character", () => {
    beginItemUseConfirmation({ source: "campaign", instanceId: VITALITY, unitTemplateId: UNIT_ID });

    teardownItemInteractionAfterTransition(
      equipPhaseFor("campaign"), equipPhaseFor("campaign"),
    );

    expect(readItemInteractionForPhase(equipPhaseFor("campaign"))).not.toBeNull();
  });

  it("disposes it when the selected character changes", () => {
    beginItemUseConfirmation({ source: "campaign", instanceId: VITALITY, unitTemplateId: UNIT_ID });

    teardownItemInteractionAfterTransition(
      equipPhaseFor("campaign", UNIT_ID), equipPhaseFor("campaign", "healer"),
    );

    // And it does not reappear on returning to the original character.
    expect(readItemInteractionForPhase(equipPhaseFor("campaign", UNIT_ID))).toBeNull();
  });

  it.each([
    ["main_menu", { type: "main_menu" } as GamePhase],
    ["debug_level_select", { type: "debug_level_select" } as GamePhase],
  ])("disposes it on exit to %s, a phase carrying no sessionSource", (_label, resolved) => {
    // The owner has to come from the PREVIOUS phase — the resolved one cannot supply it.
    beginItemUseConfirmation({ source: "campaign", instanceId: VITALITY, unitTemplateId: UNIT_ID });

    teardownItemInteractionAfterTransition(equipPhaseFor("campaign"), resolved);

    expect(readItemInteractionForPhase(equipPhaseFor("campaign"))).toBeNull();
  });

  it("disposes only the owner that left, never the other session's request", () => {
    beginItemUseConfirmation({ source: "campaign", instanceId: VITALITY, unitTemplateId: UNIT_ID });
    beginItemUseConfirmation({ source: "debug", instanceId: VITALITY, unitTemplateId: UNIT_ID });

    teardownItemInteractionAfterTransition(equipPhaseFor("campaign"), { type: "main_menu" });

    expect(readItemInteractionForPhase(equipPhaseFor("campaign"))).toBeNull();
    expect(readItemInteractionForPhase(equipPhaseFor("debug"))).not.toBeNull();
  });

  it("does nothing when the previous phase was never an equipment screen", () => {
    beginItemUseConfirmation({ source: "campaign", instanceId: VITALITY, unitTemplateId: UNIT_ID });

    teardownItemInteractionAfterTransition({ type: "main_menu" }, { type: "debug_level_select" });

    expect(readItemInteractionForPhase(equipPhaseFor("campaign"))).not.toBeNull();
  });
});

describe("applyItemUsePhaseAction", () => {
  it.each<PlayerSessionSource>(["campaign", "debug"])(
    "grants exactly one bonus and removes exactly one instance (%s)",
    (source) => {
      const before = PlayerSessionStore.getSession(source);
      const instanceCount = Object.keys(before.inventory.instances).length;

      commit(source);

      const after = PlayerSessionStore.getSession(source);
      expect(after.roster.units[UNIT_ID].permanentBonuses).toEqual({ hp: 5 });
      expect(Object.keys(after.inventory.instances)).toHaveLength(instanceCount - 1);
      expect(after.inventory.instances[VITALITY]).toBeUndefined();
      const referenced = Object.values(after.inventory.containers).some(c =>
        Object.values(c.slots).includes(VITALITY),
      );
      expect(referenced).toBe(false);
    },
  );

  it("produces identical roster and inventory deltas for equivalent campaign and debug sessions", () => {
    commit("campaign");
    commit("debug");

    const campaign = PlayerSessionStore.getSession("campaign");
    const debug = PlayerSessionStore.getSession("debug");

    expect(campaign.roster.units[UNIT_ID].permanentBonuses)
      .toEqual(debug.roster.units[UNIT_ID].permanentBonuses);
    expect(campaign.inventory.instances[VITALITY]).toBeUndefined();
    expect(debug.inventory.instances[VITALITY]).toBeUndefined();
  });

  it("keeps the storage trees isolated", () => {
    commit("campaign");

    const debug = PlayerSessionStore.getSession("debug");
    expect(debug.roster.units[UNIT_ID].permanentBonuses).toEqual({});
    expect(debug.inventory.instances[VITALITY]).toBeDefined();
  });

  it("stacks two different instances without a cap", () => {
    commit("campaign", VITALITY);
    commit("campaign", MIGHT);

    expect(PlayerSessionStore.getSession("campaign").roster.units[UNIT_ID].permanentBonuses)
      .toEqual({ hp: 5, physicalStrength: 2 });
  });

  it("writes nothing when no request is pending", () => {
    const before = PlayerSessionStore.getSession("campaign");

    applyItemUsePhaseAction({
      previousPhase: equipPhaseFor("campaign"),
      action: { type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID },
    });

    const after = PlayerSessionStore.getSession("campaign");
    expect(after.roster).toBe(before.roster);
    expect(after.inventory).toBe(before.inventory);
  });

  it("writes nothing when the action's instance does not match the stored request", () => {
    beginItemUseConfirmation({ source: "campaign", instanceId: VITALITY, unitTemplateId: UNIT_ID });
    const before = PlayerSessionStore.getSession("campaign");

    applyItemUsePhaseAction({
      previousPhase: equipPhaseFor("campaign"),
      action: { type: "confirm_use_item", instanceId: MIGHT, unitTemplateId: UNIT_ID },
    });

    expect(PlayerSessionStore.getSession("campaign").inventory).toBe(before.inventory);
  });

  it("writes nothing when the action's target does not match the stored request", () => {
    beginItemUseConfirmation({ source: "campaign", instanceId: VITALITY, unitTemplateId: UNIT_ID });
    const before = PlayerSessionStore.getSession("campaign");

    applyItemUsePhaseAction({
      previousPhase: equipPhaseFor("campaign"),
      action: { type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: "healer" },
    });

    expect(PlayerSessionStore.getSession("campaign").inventory).toBe(before.inventory);
  });

  it("disposes the request whether or not the commit succeeds", () => {
    beginItemUseConfirmation({ source: "campaign", instanceId: VITALITY, unitTemplateId: UNIT_ID });

    commit("campaign");

    expect(readItemInteractionForPhase(equipPhaseFor("campaign"))).toBeNull();
  });

  it("grants nothing on a repeated confirmation of an already consumed instance", () => {
    commit("campaign");
    const afterFirst = PlayerSessionStore.getSession("campaign");

    commit("campaign"); // files the same request again and confirms it

    const afterSecond = PlayerSessionStore.getSession("campaign");
    expect(afterSecond.roster.units[UNIT_ID].permanentBonuses).toEqual({ hp: 5 });
    expect(afterSecond.inventory).toBe(afterFirst.inventory);
  });

  it("refuses a dead target and leaves the item in the backpack", () => {
    const session = PlayerSessionStore.getSession("campaign");
    PlayerSessionStore.replaceRoster("campaign", {
      units: {
        ...session.roster.units,
        [UNIT_ID]: { ...session.roster.units[UNIT_ID], lifeState: "dead", currentHp: 0 },
      },
    });

    commit("campaign");

    const after = PlayerSessionStore.getSession("campaign");
    expect(after.roster.units[UNIT_ID].permanentBonuses).toEqual({});
    expect(after.inventory.instances[VITALITY]).toBeDefined();
  });

  it.each<PlayerSessionSource>(["campaign", "debug"])(
    "commits only the confirming phase's own session when both hold an identical request (%s)",
    (source) => {
      const other: PlayerSessionSource = source === "campaign" ? "debug" : "campaign";
      // Identical instance and character ids in both sessions: a debug reset recreates the same
      // authored instance ids, so nothing but the owning phase can tell these two apart.
      beginItemUseConfirmation({ source, instanceId: VITALITY, unitTemplateId: UNIT_ID });
      beginItemUseConfirmation({ source: other, instanceId: VITALITY, unitTemplateId: UNIT_ID });
      const untouched = PlayerSessionStore.getSession(other);

      applyItemUsePhaseAction({
        previousPhase: equipPhaseFor(source),
        action: { type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID },
      });

      expect(PlayerSessionStore.getSession(source).roster.units[UNIT_ID].permanentBonuses)
        .toEqual({ hp: 5 });
      expect(readItemInteractionForPhase(equipPhaseFor(source))).toBeNull();

      // The other owner is untouched in both domains — session and confirmation alike.
      const otherAfter = PlayerSessionStore.getSession(other);
      expect(otherAfter.roster).toBe(untouched.roster);
      expect(otherAfter.inventory).toBe(untouched.inventory);
      expect(readItemInteractionForPhase(equipPhaseFor(other))).not.toBeNull();
    },
  );

  it("writes nothing and disposes nothing from a non-equipment phase", () => {
    beginItemUseConfirmation({ source: "campaign", instanceId: VITALITY, unitTemplateId: UNIT_ID });
    beginItemUseConfirmation({ source: "debug", instanceId: VITALITY, unitTemplateId: UNIT_ID });
    const campaign = PlayerSessionStore.getSession("campaign");
    const debug = PlayerSessionStore.getSession("debug");

    applyItemUsePhaseAction({
      previousPhase: { type: "main_menu" },
      action: { type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID },
    });

    expect(PlayerSessionStore.getSession("campaign").inventory).toBe(campaign.inventory);
    expect(PlayerSessionStore.getSession("debug").inventory).toBe(debug.inventory);
    expect(readItemInteractionForPhase(equipPhaseFor("campaign"))).not.toBeNull();
    expect(readItemInteractionForPhase(equipPhaseFor("debug"))).not.toBeNull();
  });
});
