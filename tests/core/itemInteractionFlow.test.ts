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
 * The item-use interaction through the real pipeline: which requests are admitted, what a single-click
 * equip does to the two origins, and — the part a projection cannot establish — that a confirmation is
 * DISPOSED rather than left behind for the dialog to reappear from.
 */

const UNIT_ID = "warrior";
const OTHER_UNIT_ID = "mage";
const POTION = "item_start_small_healing_potion";
const VITALITY = "item_start_vitality_essence";
const RING = "item_start_bronze_ring";
const SCROLL = "item_start_small_resurrection_scroll";

function equipPhase(manager: PhaseManagerClass): Extract<
  GamePhase, { type: "equip_screen" | "debug_equip_screen" }
> {
  const phase = manager.getPhase();
  if (phase.type !== "equip_screen" && phase.type !== "debug_equip_screen") {
    throw new Error(`expected an equipment screen, got ${phase.type}`);
  }
  return phase;
}

function setCurrentHp(source: PlayerSessionSource, hp: number | null): void {
  const session = PlayerSessionStore.getSession(source);
  PlayerSessionStore.replaceRoster(source, {
    units: { ...session.roster.units, [UNIT_ID]: { ...session.roster.units[UNIT_ID], currentHp: hp } },
  });
}

function equippedUsable(source: PlayerSessionSource): string | undefined {
  return PlayerSessionStore.getSession(source)
    .inventory.containers[`equip_${UNIT_ID}`].slots.usable_slot;
}

/** The backpack slot key currently holding `instanceId`, or null. */
function backpackSlotOf(source: PlayerSessionSource, instanceId: string): string | null {
  const containers = PlayerSessionStore.getSession(source).inventory.containers;
  const backpack = Object.values(containers).find(c => c.kind === "backpack")!;
  const found = Object.entries(backpack.slots).find(([, id]) => id === instanceId);
  return found ? found[0] : null;
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

describe("single-click equip", () => {
  it("moves a backpack usable into usable_slot and re-homes its usability entry", () => {
    const h = openCampaignEquipScreen();
    setCurrentHp("campaign", 1);
    h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });
    expect(equipPhase(h.manager).itemUsage[POTION].origin).toBe("backpack");

    h.manager.transition({ type: "equip_item", instanceId: POTION, unitTemplateId: UNIT_ID });

    expect(equippedUsable("campaign")).toBe(POTION);
    expect(backpackSlotOf("campaign", POTION)).toBeNull();
    // The same instance now reports on the OTHER origin — one entry, one location.
    expect(equipPhase(h.manager).itemUsage[POTION]).toMatchObject({
      canUse: true, origin: "equipped_usable",
    });
  });

  /**
   * "Swap when occupied" needs no gesture of its own: `equipItem` already sends the displaced item
   * back to the backpack slot the new one came from.
   */
  it("swaps the occupant of usable_slot back into the clicked slot", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "equip_item", instanceId: POTION, unitTemplateId: UNIT_ID });
    expect(equippedUsable("campaign")).toBe(POTION);

    // A second usable — the resurrection scroll — claims the one usable_slot.
    const scrollSlot = backpackSlotOf("campaign", SCROLL);
    h.manager.transition({ type: "equip_item", instanceId: SCROLL, unitTemplateId: UNIT_ID });

    expect(equippedUsable("campaign")).toBe(SCROLL);
    // The displaced potion lands in the slot the scroll came from, not just "somewhere free".
    expect(backpackSlotOf("campaign", POTION)).toBe(scrollSlot);
    expect(backpackSlotOf("campaign", SCROLL)).toBeNull();
  });

  it("unequips on a single click, returning the item to the backpack", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "equip_item", instanceId: POTION, unitTemplateId: UNIT_ID });

    h.manager.transition({ type: "unequip_item", unitTemplateId: UNIT_ID, slot: "usable_slot" });

    expect(equippedUsable("campaign")).toBeUndefined();
    expect(backpackSlotOf("campaign", POTION)).not.toBeNull();
    expect(equipPhase(h.manager).itemUsage[POTION].origin).toBe("backpack");
  });
});

describe("admitting a use request", () => {
  it("opens exactly one confirmation at a time", () => {
    const h = openCampaignEquipScreen();

    h.manager.transition({ type: "request_use_item", instanceId: VITALITY, origin: "backpack" });
    expect(equipPhase(h.manager).pendingItemUsePrompt).not.toBeNull();

    // A second request — for any item, from any origin — is refused while one is open.
    expect(h.manager.transition({
      type: "request_use_item", instanceId: POTION, origin: "backpack",
    }).status).toBe("rejected");
    expect(equipPhase(h.manager).pendingItemUsePrompt).toMatchObject({ instanceId: VITALITY });

    h.manager.transition({ type: "cancel_use_item" });
    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
  });

  it("blocks competing equipment mutations while a confirmation is open", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "request_use_item", instanceId: VITALITY, origin: "backpack" });

    expect(h.manager.transition({
      type: "equip_item", instanceId: POTION, unitTemplateId: UNIT_ID,
    }).status).toBe("rejected");
    expect(equippedUsable("campaign")).toBeUndefined();
  });

  it("rejects an item the screen evaluated for no origin at all", () => {
    const h = openCampaignEquipScreen();

    // A ring is equipment: it carries no usability verdict, so neither gesture can use it.
    expect(h.manager.transition({
      type: "request_use_item", instanceId: RING, origin: "backpack",
    }).status).toBe("rejected");
    expect(h.manager.transition({
      type: "request_use_item", instanceId: "nope", origin: "backpack",
    }).status).toBe("rejected");
    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
  });

  /**
   * The origin guard, end to end. A backpack verdict must not admit an equipped-slot request, and
   * once the item moves the previously valid origin stops working.
   */
  it("admits only the origin the committed verdict describes", () => {
    const h = openCampaignEquipScreen();
    setCurrentHp("campaign", 1);
    h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });

    expect(h.manager.transition({
      type: "request_use_item", instanceId: POTION, origin: "equipped_usable",
    }).status).toBe("rejected");

    h.manager.transition({ type: "equip_item", instanceId: POTION, unitTemplateId: UNIT_ID });

    expect(h.manager.transition({
      type: "request_use_item", instanceId: POTION, origin: "backpack",
    }).status).toBe("rejected");
    expect(h.manager.transition({
      type: "request_use_item", instanceId: POTION, origin: "equipped_usable",
    }).status).toBe("applied");
    expect(equipPhase(h.manager).pendingItemUsePrompt).toMatchObject({ instanceId: POTION });
  });
});

describe("stale interactions", () => {
  it("hides the confirmation when the character changes, and does not restore it on return", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "request_use_item", instanceId: VITALITY, origin: "backpack" });

    h.manager.transition({ type: "switch_equip_unit", templateId: OTHER_UNIT_ID });
    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();

    h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });
    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
  });

  it("disposes the interaction when the screen is left", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "request_use_item", instanceId: VITALITY, origin: "backpack" });

    h.manager.transition({ type: "close_equip_screen" });
    h.manager.transition({ type: "open_equip_screen", unitTemplateId: UNIT_ID });

    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
  });

  it("a confirm that fails live re-validation clears the interaction and writes nothing", () => {
    // The dialog was opened while the character was wounded; the roster changes underneath before the
    // player confirms. The use must neither apply nor linger.
    const h = openCampaignEquipScreen();
    setCurrentHp("campaign", 1);
    h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });
    h.manager.transition({ type: "request_use_item", instanceId: POTION, origin: "backpack" });
    expect(equipPhase(h.manager).pendingItemUsePrompt).not.toBeNull();

    // Heal behind the pipeline's back, so routing still sees the stale committed prompt.
    setCurrentHp("campaign", null);
    const before = PlayerSessionStore.getSession("campaign");

    h.manager.transition({
      type: "confirm_use_item", instanceId: POTION, unitTemplateId: UNIT_ID,
    });

    expect(PlayerSessionStore.getSession("campaign")).toEqual(before);
    // Cleared, not left behind: the dialog is gone and a fresh request is possible again.
    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
    setCurrentHp("campaign", 1);
    h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });
    h.manager.transition({ type: "request_use_item", instanceId: POTION, origin: "backpack" });
    expect(equipPhase(h.manager).pendingItemUsePrompt).toMatchObject({ instanceId: POTION });
  });
});

describe("session isolation", () => {
  it("a campaign confirmation is invisible to a debug session, and vice versa", () => {
    const campaign = openCampaignEquipScreen();
    campaign.manager.transition({
      type: "request_use_item", instanceId: VITALITY, origin: "backpack",
    });

    const debug = createLifecycleHarness();
    debug.openDebugSession(1);
    debug.manager.transition({ type: "switch_debug_unit", templateId: UNIT_ID });

    expect(equipPhase(debug.manager).pendingItemUsePrompt).toBeNull();
    expect(equipPhase(campaign.manager).pendingItemUsePrompt)
      .toMatchObject({ instanceId: VITALITY });
  });
});
