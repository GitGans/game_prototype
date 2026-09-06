import { describe, it, expect, beforeEach } from "vitest";
import { createLifecycleHarness } from "./helpers/phaseManagerLifecycleHarness";
import { GameState } from "../../src/core/GameState";
import { PlayerSessionStore } from "../../src/core/playerSessionStore";
import { clearConsumeConfirmationSlot } from "../../src/core/consumeConfirmationStorage";
import type { PhaseManagerClass } from "../../src/core/PhaseManager";
import type { GamePhase } from "../../src/core/phases";
import type { PlayerSessionSource } from "../../src/core/playerSessionState";
import type { InventoryState } from "../../src/inventory";
import { initCampaignState } from "../../src/core/initCampaignState";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";

/**
 * Production-pipeline acceptance: a real `createProductionPhaseManager()` driving real effects,
 * real storage and a real snapshot rebuild. These are the guarantees the individual collaborator
 * tests cannot establish on their own.
 */

const UNIT_ID = "warrior";
const VITALITY = "item_start_vitality_essence";
const MIGHT = "item_start_might_essence";

function equipPhase(manager: PhaseManagerClass): Extract<
  GamePhase, { type: "equip_screen" | "debug_equip_screen" }
> {
  const phase = manager.getPhase();
  if (phase.type !== "equip_screen" && phase.type !== "debug_equip_screen") {
    throw new Error(`expected an equipment screen, got ${phase.type}`);
  }
  return phase;
}

function bonuses(source: PlayerSessionSource): Record<string, number> {
  return PlayerSessionStore.getSession(source).roster.units[UNIT_ID].permanentBonuses;
}

function inventory(source: PlayerSessionSource): InventoryState {
  return PlayerSessionStore.getSession(source).inventory;
}

function isReferencedAnywhere(inv: InventoryState, instanceId: string): boolean {
  return Object.values(inv.containers).some(c => Object.values(c.slots).includes(instanceId));
}

/** Campaign: new game → equip screen for the warrior. */
function openCampaignEquipScreen() {
  const h = createLifecycleHarness();
  h.startNewCampaign();
  h.manager.transition({ type: "open_equip_screen", unitTemplateId: UNIT_ID });
  expect(h.manager.getPhase().type).toBe("equip_screen");
  return h;
}

/**
 * Debug: main_menu → debug session → select the warrior.
 *
 * Deliberately NOT via `new_game`: that action is accepted from any phase and legitimately
 * disposes BOTH sessions' confirmations and rebuilds the campaign, which would mask exactly the
 * cross-session isolation these tests are here to check.
 */
function openDebugEquipScreen() {
  const h = createLifecycleHarness();
  h.openDebugSession(1);
  h.manager.transition({ type: "switch_debug_unit", templateId: UNIT_ID });
  expect(h.manager.getPhase().type).toBe("debug_equip_screen");
  return h;
}

beforeEach(() => {
  // Deterministic campaign state for the tests that read it without opening a campaign screen.
  GameState.setCampaignState(initCampaignState({
    playerUnits: PLAYER_UNITS,
    itemCatalog: ITEM_CATALOG,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    mapDefinitions: MAP_DEFINITIONS,
    initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
  }));
  GameState.clearDebugState();
  clearConsumeConfirmationSlot("campaign");
  clearConsumeConfirmationSlot("debug");
});

describe("request → cancel", () => {
  it("opens a prompt without writing to either domain, and closes it on cancel", () => {
    const h = openCampaignEquipScreen();
    const before = inventory("campaign");

    h.manager.transition({ type: "request_consume_item", instanceId: VITALITY });

    expect(equipPhase(h.manager).pendingConsumePrompt).toMatchObject({
      instanceId: VITALITY, unitTemplateId: UNIT_ID, stat: "hp", amount: 5, healsCurrentHp: true,
    });
    expect(bonuses("campaign")).toEqual({});
    expect(inventory("campaign")).toBe(before);

    h.manager.transition({ type: "cancel_consume_item" });

    expect(equipPhase(h.manager).pendingConsumePrompt).toBeNull();
    expect(bonuses("campaign")).toEqual({});
    expect(inventory("campaign")).toBe(before);
  });
});

describe("request → confirm → repeated confirm", () => {
  it("grants exactly one bonus and removes exactly one instance", () => {
    const h = openCampaignEquipScreen();
    const instanceCount = Object.keys(inventory("campaign").instances).length;

    h.manager.transition({ type: "request_consume_item", instanceId: VITALITY });
    h.manager.transition({
      type: "confirm_consume_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(bonuses("campaign")).toEqual({ hp: 5 });
    expect(Object.keys(inventory("campaign").instances)).toHaveLength(instanceCount - 1);
    expect(inventory("campaign").instances[VITALITY]).toBeUndefined();
    expect(isReferencedAnywhere(inventory("campaign"), VITALITY)).toBe(false);
    expect(equipPhase(h.manager).pendingConsumePrompt).toBeNull();

    // A second confirmation of the same instance grants nothing extra.
    const afterFirst = inventory("campaign");
    h.manager.transition({
      type: "confirm_consume_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(bonuses("campaign")).toEqual({ hp: 5 });
    expect(inventory("campaign")).toBe(afterFirst);
  });

  it("stacks two different instances", () => {
    const h = openCampaignEquipScreen();

    for (const instanceId of [VITALITY, MIGHT]) {
      h.manager.transition({ type: "request_consume_item", instanceId });
      h.manager.transition({ type: "confirm_consume_item", instanceId, unitTemplateId: UNIT_ID });
    }

    expect(bonuses("campaign")).toEqual({ hp: 5, physicalStrength: 2 });
  });

  it("heals current HP alongside the max-HP growth", () => {
    const h = openCampaignEquipScreen();
    const session = PlayerSessionStore.getSession("campaign");
    PlayerSessionStore.replaceRoster("campaign", {
      units: { ...session.roster.units, [UNIT_ID]: { ...session.roster.units[UNIT_ID], currentHp: 4 } },
    });

    h.manager.transition({ type: "request_consume_item", instanceId: VITALITY });
    h.manager.transition({
      type: "confirm_consume_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(PlayerSessionStore.getSession("campaign").roster.units[UNIT_ID].currentHp).toBe(9);
  });
});

describe("a pending request never outlives the screen that owns it", () => {
  it("is dropped when the selected character changes", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "request_consume_item", instanceId: VITALITY });

    h.manager.transition({ type: "switch_equip_unit", templateId: "healer" });
    h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });

    expect(equipPhase(h.manager).pendingConsumePrompt).toBeNull();

    // Confirming the original ids now does nothing.
    const before = inventory("campaign");
    h.manager.transition({
      type: "confirm_consume_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });
    expect(bonuses("campaign")).toEqual({});
    expect(inventory("campaign")).toBe(before);
  });

  it("is dropped when the screen is left and re-entered", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "request_consume_item", instanceId: VITALITY });

    h.manager.transition({ type: "close_equip_screen" });
    h.manager.transition({ type: "open_equip_screen", unitTemplateId: UNIT_ID });

    expect(equipPhase(h.manager).pendingConsumePrompt).toBeNull();
    expect(bonuses("campaign")).toEqual({});
  });

  it("is dropped by a debug reset, though the reset recreates the very same instance id", () => {
    const h = openDebugEquipScreen();
    h.manager.transition({ type: "request_consume_item", instanceId: VITALITY });
    expect(equipPhase(h.manager).pendingConsumePrompt).not.toBeNull();

    h.manager.transition({ type: "reset_debug_session" });

    // Same phase, same selected character, same authored instance id — only ownership by
    // session plus the explicit lifecycle disposal distinguishes the stale request.
    expect(equipPhase(h.manager).selectedUnitTemplateId).toBe(UNIT_ID);
    expect(inventory("debug").instances[VITALITY]).toBeDefined();
    expect(equipPhase(h.manager).pendingConsumePrompt).toBeNull();

    const before = inventory("debug");
    h.manager.transition({
      type: "confirm_consume_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });
    expect(bonuses("debug")).toEqual({});
    expect(inventory("debug")).toBe(before);
  });

  it("commits nothing when the item disappears between request and confirm", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "request_consume_item", instanceId: VITALITY });

    // Another route removes the instance while the dialog is open.
    const session = PlayerSessionStore.getSession("campaign");
    const instances = { ...session.inventory.instances };
    delete instances[VITALITY];
    const shared = Object.values(session.inventory.containers).find(
      c => c.kind === "backpack" && c.ownerTemplateId === undefined,
    )!;
    const slots = { ...shared.slots };
    for (const [key, value] of Object.entries(slots)) if (value === VITALITY) delete slots[key];
    PlayerSessionStore.replaceInventory("campaign", {
      instances,
      containers: { ...session.inventory.containers, [shared.id]: { ...shared, slots } },
    });

    h.manager.transition({
      type: "confirm_consume_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(bonuses("campaign")).toEqual({});
  });
});

describe("a dead character can use nothing", () => {
  it("reports the reason and keeps the item", () => {
    const h = openCampaignEquipScreen();
    const session = PlayerSessionStore.getSession("campaign");
    PlayerSessionStore.replaceRoster("campaign", {
      units: {
        ...session.roster.units,
        [UNIT_ID]: { ...session.roster.units[UNIT_ID], lifeState: "dead", currentHp: 0 },
      },
    });
    // Refresh the snapshot through the pipeline.
    h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });

    expect(equipPhase(h.manager).consumableUsage[VITALITY])
      .toEqual({ canUse: false, reason: "unit_dead" });

    const result = h.manager.transition({ type: "request_consume_item", instanceId: VITALITY });

    expect(result).toEqual({ status: "rejected" });
    expect(inventory("campaign").instances[VITALITY]).toBeDefined();
  });
});

describe("campaign and debug behave identically and stay isolated", () => {
  it("produces the same roster and inventory delta in both sessions", () => {
    const campaign = openCampaignEquipScreen();
    campaign.manager.transition({ type: "request_consume_item", instanceId: VITALITY });
    campaign.manager.transition({
      type: "confirm_consume_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    const debug = openDebugEquipScreen();
    debug.manager.transition({ type: "request_consume_item", instanceId: VITALITY });
    debug.manager.transition({
      type: "confirm_consume_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(bonuses("debug")).toEqual(bonuses("campaign"));
    expect(inventory("campaign").instances[VITALITY]).toBeUndefined();
    expect(inventory("debug").instances[VITALITY]).toBeUndefined();
  });

  it("leaves the other storage tree untouched", () => {
    const h = openDebugEquipScreen();
    const campaignBonusesBefore = bonuses("campaign");

    h.manager.transition({ type: "request_consume_item", instanceId: VITALITY });
    h.manager.transition({
      type: "confirm_consume_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(bonuses("debug")).toEqual({ hp: 5 });
    expect(bonuses("campaign")).toEqual(campaignBonusesBefore);
    expect(inventory("campaign").instances[VITALITY]).toBeDefined();
  });
});

describe("two managers never see each other's confirmation", () => {
  it("keeps a campaign request invisible to a debug screen, and vice versa", () => {
    // Two managers, each on its own session's equipment screen, both with a pending request
    // naming the SAME authored instance id and the SAME character.
    const campaign = openCampaignEquipScreen();
    campaign.manager.transition({ type: "request_consume_item", instanceId: VITALITY });

    const debug = openDebugEquipScreen();
    expect(equipPhase(debug.manager).pendingConsumePrompt).toBeNull();

    debug.manager.transition({ type: "request_consume_item", instanceId: VITALITY });

    // Each still sees only its own.
    campaign.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });
    expect(equipPhase(campaign.manager).pendingConsumePrompt).toMatchObject({
      instanceId: VITALITY,
    });
    expect(equipPhase(debug.manager).pendingConsumePrompt).toMatchObject({ instanceId: VITALITY });

    // Cancelling on the debug manager disposes only the debug request.
    debug.manager.transition({ type: "cancel_consume_item" });
    expect(equipPhase(debug.manager).pendingConsumePrompt).toBeNull();

    campaign.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });
    expect(equipPhase(campaign.manager).pendingConsumePrompt).not.toBeNull();
  });

  it("lets each manager commit only against its own session", () => {
    const campaign = openCampaignEquipScreen();
    const debug = openDebugEquipScreen();

    debug.manager.transition({ type: "request_consume_item", instanceId: VITALITY });
    debug.manager.transition({
      type: "confirm_consume_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(bonuses("debug")).toEqual({ hp: 5 });
    expect(bonuses("campaign")).toEqual({});

    // The campaign manager's own request is unaffected by the debug commit.
    campaign.manager.transition({ type: "request_consume_item", instanceId: VITALITY });
    campaign.manager.transition({
      type: "confirm_consume_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(bonuses("campaign")).toEqual({ hp: 5 });
  });
});
