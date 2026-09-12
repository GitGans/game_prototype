import { describe, it, expect, beforeEach } from "vitest";
import { createLifecycleHarness } from "./helpers/phaseManagerLifecycleHarness";
import { GameState } from "../../src/core/GameState";
import { PlayerSessionStore } from "../../src/core/playerSessionStore";
import { clearItemInteractionSlot } from "../../src/core/itemInteractionStorage";
import { initCampaignState } from "../../src/core/initCampaignState";
import type { PhaseManagerClass } from "../../src/core/PhaseManager";
import type { GamePhase } from "../../src/core/phases";
import type { PlayerSessionSource } from "../../src/core/playerSessionState";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";

/**
 * The item-action window through the real pipeline: which modal is open, which options are
 * enabled, and — the part a projection cannot establish — that a selection DISPOSES the stored
 * interaction rather than leaving it behind for the window to reappear from.
 */

const UNIT_ID = "warrior";
const OTHER_UNIT_ID = "mage";
const POTION = "item_start_small_healing_potion";
const VITALITY = "item_start_vitality_essence";
const RING = "item_start_bronze_ring";

function equipPhase(manager: PhaseManagerClass): Extract<
  GamePhase, { type: "equip_screen" | "debug_equip_screen" }
> {
  const phase = manager.getPhase();
  if (phase.type !== "equip_screen" && phase.type !== "debug_equip_screen") {
    throw new Error(`expected an equipment screen, got ${phase.type}`);
  }
  return phase;
}

function option(manager: PhaseManagerClass, action: "use" | "equip") {
  const menu = equipPhase(manager).itemActionMenu;
  if (!menu) throw new Error("no item-action window is open");
  const found = menu.options.find(o => o.action === action);
  if (!found) throw new Error(`window has no "${action}" option`);
  return found;
}

function setCurrentHp(source: PlayerSessionSource, hp: number | null): void {
  const session = PlayerSessionStore.getSession(source);
  PlayerSessionStore.replaceRoster(source, {
    units: { ...session.roster.units, [UNIT_ID]: { ...session.roster.units[UNIT_ID], currentHp: hp } },
  });
}

function killUnit(source: PlayerSessionSource): void {
  const session = PlayerSessionStore.getSession(source);
  PlayerSessionStore.replaceRoster(source, {
    units: {
      ...session.roster.units,
      [UNIT_ID]: { ...session.roster.units[UNIT_ID], lifeState: "dead", currentHp: 0 },
    },
  });
}

function equippedUsable(source: PlayerSessionSource): string | undefined {
  return PlayerSessionStore.getSession(source)
    .inventory.containers[`equip_${UNIT_ID}`].slots.usable_slot;
}

function openCampaignEquipScreen() {
  const h = createLifecycleHarness();
  h.startNewCampaign();
  h.manager.transition({ type: "open_equip_screen", unitTemplateId: UNIT_ID });
  return h;
}

beforeEach(() => {
  GameState.setCampaignState(initCampaignState({
    playerUnits: PLAYER_UNITS,
    itemCatalog: ITEM_CATALOG,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    mapDefinitions: MAP_DEFINITIONS,
    initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
  }));
  GameState.clearDebugState();
  clearItemInteractionSlot("campaign");
  clearItemInteractionSlot("debug");
});

describe("opening the window", () => {
  it("offers Use and Equip for a backpack usable, and writes nothing", () => {
    const h = openCampaignEquipScreen();
    const before = PlayerSessionStore.getSession("campaign");
    setCurrentHp("campaign", 1); // wounded, so Use is genuinely available

    h.manager.transition({ type: "open_item_actions", instanceId: POTION });

    const menu = equipPhase(h.manager).itemActionMenu!;
    expect(menu.instanceId).toBe(POTION);
    expect(menu.itemName).toBe("Small Healing Potion");
    expect(menu.options.map(o => [o.action, o.enabled]))
      .toEqual([["use", true], ["equip", true]]);
    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
    expect(PlayerSessionStore.getSession("campaign").inventory).toEqual(before.inventory);
  });

  it("keeps Equip available at full HP and on a dead character, disabling only Use", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });

    expect(option(h.manager, "use")).toEqual({
      action: "use", enabled: false, disabledReason: "unit_full_hp",
    });
    expect(option(h.manager, "equip").enabled).toBe(true);

    killUnit("campaign");
    h.manager.transition({ type: "close_item_actions" });
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });

    expect(option(h.manager, "use")).toEqual({
      action: "use", enabled: false, disabledReason: "unit_dead",
    });
    expect(option(h.manager, "equip").enabled).toBe(true);
  });

  it("opens at most one modal — a confirmation blocks the window and vice versa", () => {
    const h = openCampaignEquipScreen();

    h.manager.transition({ type: "request_use_item", instanceId: VITALITY });
    expect(equipPhase(h.manager).pendingItemUsePrompt).not.toBeNull();
    expect(h.manager.transition({ type: "open_item_actions", instanceId: POTION }).status)
      .toBe("rejected");

    h.manager.transition({ type: "cancel_use_item" });
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });
    expect(h.manager.transition({ type: "request_use_item", instanceId: VITALITY }).status)
      .toBe("rejected");
    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
  });

  it("rejects an item that is not a backpack usable or consumable", () => {
    const h = openCampaignEquipScreen();

    expect(h.manager.transition({ type: "open_item_actions", instanceId: RING }).status)
      .toBe("rejected");
    expect(h.manager.transition({ type: "open_item_actions", instanceId: "nope" }).status)
      .toBe("rejected");
    expect(equipPhase(h.manager).itemActionMenu).toBeNull();
  });
});

describe("selecting an action", () => {
  it("Use replaces the window with the existing confirmation", () => {
    const h = openCampaignEquipScreen();
    setCurrentHp("campaign", 1);
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });

    h.manager.transition({ type: "select_item_action", instanceId: POTION, action: "use" });

    expect(equipPhase(h.manager).itemActionMenu).toBeNull();
    expect(equipPhase(h.manager).pendingItemUsePrompt).toMatchObject({ instanceId: POTION });
  });

  it("Equip closes the window and moves the potion into usable_slot", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });

    h.manager.transition({ type: "select_item_action", instanceId: POTION, action: "equip" });

    expect(equipPhase(h.manager).itemActionMenu).toBeNull();
    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
    expect(equippedUsable("campaign")).toBe(POTION);
  });

  it("rejects a disabled option, leaving the window open", () => {
    const h = openCampaignEquipScreen(); // full HP → Use disabled
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });

    expect(h.manager.transition({
      type: "select_item_action", instanceId: POTION, action: "use",
    }).status).toBe("rejected");
    expect(equipPhase(h.manager).itemActionMenu).not.toBeNull();
    // Equip was never disabled here, so it still goes through.
    expect(option(h.manager, "equip").enabled).toBe(true);
  });

  it("rejects a selection naming a different instance, leaving the interaction untouched", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });

    expect(h.manager.transition({
      type: "select_item_action", instanceId: VITALITY, action: "use",
    }).status).toBe("rejected");

    // The stored interaction still belongs to the potion — an unrelated action disposed nothing.
    expect(equipPhase(h.manager).itemActionMenu?.instanceId).toBe(POTION);
  });

  it("closes without writing on close_item_actions", () => {
    const h = openCampaignEquipScreen();
    const before = PlayerSessionStore.getSession("campaign");
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });

    h.manager.transition({ type: "close_item_actions" });

    expect(equipPhase(h.manager).itemActionMenu).toBeNull();
    expect(PlayerSessionStore.getSession("campaign")).toEqual(before);
  });
});

describe("stale interactions", () => {
  it("hides the window when the character changes, and does not restore it on return", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });

    h.manager.transition({ type: "switch_equip_unit", templateId: OTHER_UNIT_ID });
    expect(equipPhase(h.manager).itemActionMenu).toBeNull();

    h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });
    expect(equipPhase(h.manager).itemActionMenu).toBeNull();
  });

  it("disposes the interaction when the screen is left", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });

    h.manager.transition({ type: "close_equip_screen" });
    h.manager.transition({ type: "open_equip_screen", unitTemplateId: UNIT_ID });

    expect(equipPhase(h.manager).itemActionMenu).toBeNull();
  });

  it("losing USE eligibility alone leaves the window open, with Use disabled", () => {
    // Only a selection disposes. A wound healing between open and render must not close a
    // window whose Equip option is still perfectly usable.
    const h = openCampaignEquipScreen();
    setCurrentHp("campaign", 1);
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });
    expect(option(h.manager, "use").enabled).toBe(true);

    setCurrentHp("campaign", null); // back to full health
    h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID }); // re-render, same unit

    expect(equipPhase(h.manager).itemActionMenu).not.toBeNull();
    expect(option(h.manager, "use").enabled).toBe(false);
    expect(option(h.manager, "equip").enabled).toBe(true);
  });

  it("a selection that fails live re-validation clears the interaction and writes nothing", () => {
    // The window was rendered while the character was wounded; the roster changes underneath
    // before the player clicks. The action must neither apply nor linger.
    const h = openCampaignEquipScreen();
    setCurrentHp("campaign", 1);
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });
    expect(option(h.manager, "use").enabled).toBe(true);

    // Heal behind the pipeline's back, so the resolver still sees the stale enabled snapshot.
    setCurrentHp("campaign", null);
    const before = PlayerSessionStore.getSession("campaign");

    h.manager.transition({ type: "select_item_action", instanceId: POTION, action: "use" });

    expect(PlayerSessionStore.getSession("campaign")).toEqual(before);
    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
    // Cleared, not left behind: the window is gone and can be opened again.
    expect(equipPhase(h.manager).itemActionMenu).toBeNull();
    h.manager.transition({ type: "open_item_actions", instanceId: POTION });
    expect(equipPhase(h.manager).itemActionMenu?.instanceId).toBe(POTION);
  });
});

describe("session isolation", () => {
  it("a campaign window is invisible to a debug session, and vice versa", () => {
    const campaign = openCampaignEquipScreen();
    campaign.manager.transition({ type: "open_item_actions", instanceId: POTION });

    const debug = createLifecycleHarness();
    debug.openDebugSession(1);
    debug.manager.transition({ type: "switch_debug_unit", templateId: UNIT_ID });

    expect(equipPhase(debug.manager).itemActionMenu).toBeNull();
    expect(equipPhase(campaign.manager).itemActionMenu?.instanceId).toBe(POTION);
  });
});
