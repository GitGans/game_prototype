import { describe, it, expect, beforeEach } from "vitest";
import {
  createLifecycleHarness, ORC_PATROL_ENEMY_GROUP_ID,
} from "./helpers/phaseManagerLifecycleHarness";
import { GameState } from "../../src/core/GameState";
import { PlayerSessionStore } from "../../src/core/playerSessionStore";
import { clearItemInteractionSlot } from "../../src/core/itemInteractionStorage";
import { requireBattleRuntimeForPhase } from "../../src/core/battleRuntimeAccess";
import { applyVictoryLevelUpPersistence } from "../../src/core/playerUnitPersistence";
import { resolvePlayerMaxHpForLevel } from "../../src/core/battleSetupProjection";
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
const POTION = "item_start_small_healing_potion";

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

function currentHp(source: PlayerSessionSource): number | null {
  return PlayerSessionStore.getSession(source).roster.units[UNIT_ID].currentHp;
}

/** Wound the selected character through the store, the way a battle exit would. */
function setCurrentHp(source: PlayerSessionSource, hp: number | null): void {
  const session = PlayerSessionStore.getSession(source);
  PlayerSessionStore.replaceRoster(source, {
    units: {
      ...session.roster.units,
      [UNIT_ID]: { ...session.roster.units[UNIT_ID], currentHp: hp },
    },
  });
}

/** Resolved max HP for the selected character, read off the committed phase snapshot. */
function maxHpOf(manager: PhaseManagerClass): number {
  return equipPhase(manager).unitStats!.maxHp.value;
}

/** Displayed CURRENT HP — the left half of the equipment screen's `x / y` row. */
function displayedHp(manager: PhaseManagerClass): number {
  return equipPhase(manager).unitStats!.hp.value;
}

/** The potion's authored strength, read from the catalog rather than repeated as a literal. */
const POTION_AMOUNT = (() => {
  const effect = ITEM_CATALOG.definitions.small_healing_potion.useEffect;
  if (effect?.type !== "heal") throw new Error("the starting potion is no longer a heal");
  return effect.amount;
})();

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
function openDebugEquipScreen(level = 1) {
  const h = createLifecycleHarness();
  h.openDebugSession(level);
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
  clearItemInteractionSlot("campaign");
  clearItemInteractionSlot("debug");
});

describe("request → cancel", () => {
  it("opens a prompt without writing to either domain, and closes it on cancel", () => {
    const h = openCampaignEquipScreen();
    const before = inventory("campaign");

    h.manager.transition({ type: "request_use_item", instanceId: VITALITY });

    expect(equipPhase(h.manager).pendingItemUsePrompt).toMatchObject({
      instanceId: VITALITY,
      unitTemplateId: UNIT_ID,
      effect: { type: "permanent_stat_boost", stat: "hp", amount: 5, healsCurrentHp: true },
    });
    expect(bonuses("campaign")).toEqual({});
    expect(inventory("campaign")).toBe(before);

    h.manager.transition({ type: "cancel_use_item" });

    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
    expect(bonuses("campaign")).toEqual({});
    expect(inventory("campaign")).toBe(before);
  });
});

describe("request → confirm → repeated confirm", () => {
  it("grants exactly one bonus and removes exactly one instance", () => {
    const h = openCampaignEquipScreen();
    const instanceCount = Object.keys(inventory("campaign").instances).length;

    h.manager.transition({ type: "request_use_item", instanceId: VITALITY });
    h.manager.transition({
      type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(bonuses("campaign")).toEqual({ hp: 5 });
    expect(Object.keys(inventory("campaign").instances)).toHaveLength(instanceCount - 1);
    expect(inventory("campaign").instances[VITALITY]).toBeUndefined();
    expect(isReferencedAnywhere(inventory("campaign"), VITALITY)).toBe(false);
    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();

    // A second confirmation of the same instance grants nothing extra.
    const afterFirst = inventory("campaign");
    h.manager.transition({
      type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(bonuses("campaign")).toEqual({ hp: 5 });
    expect(inventory("campaign")).toBe(afterFirst);
  });

  it("stacks two different instances", () => {
    const h = openCampaignEquipScreen();

    for (const instanceId of [VITALITY, MIGHT]) {
      h.manager.transition({ type: "request_use_item", instanceId });
      h.manager.transition({ type: "confirm_use_item", instanceId, unitTemplateId: UNIT_ID });
    }

    expect(bonuses("campaign")).toEqual({ hp: 5, physicalStrength: 2 });
  });

  it("heals current HP alongside the max-HP growth", () => {
    const h = openCampaignEquipScreen();
    const session = PlayerSessionStore.getSession("campaign");
    PlayerSessionStore.replaceRoster("campaign", {
      units: { ...session.roster.units, [UNIT_ID]: { ...session.roster.units[UNIT_ID], currentHp: 4 } },
    });

    h.manager.transition({ type: "request_use_item", instanceId: VITALITY });
    h.manager.transition({
      type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(PlayerSessionStore.getSession("campaign").roster.units[UNIT_ID].currentHp).toBe(9);
  });
});

describe("healing potions restore current HP through the same pipeline", () => {
  it("heals a wounded character and consumes the potion, without any permanent gain", () => {
    const h = openCampaignEquipScreen();
    const maxHp = maxHpOf(h.manager);
    setCurrentHp("campaign", maxHp - 30);
    h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });

    h.manager.transition({ type: "request_use_item", instanceId: POTION });
    expect(equipPhase(h.manager).pendingItemUsePrompt).toMatchObject({
      instanceId: POTION,
      effect: { type: "heal", amount: 10, restoredHp: 10, currentHp: maxHp - 30, maxHp },
    });

    h.manager.transition({
      type: "confirm_use_item", instanceId: POTION, unitTemplateId: UNIT_ID,
    });

    expect(currentHp("campaign")).toBe(maxHp - 20);
    // Healing is not growth: max HP and permanent bonuses are untouched.
    expect(bonuses("campaign")).toEqual({});
    expect(maxHpOf(h.manager)).toBe(maxHp);

    expect(inventory("campaign").instances[POTION]).toBeUndefined();
    expect(isReferencedAnywhere(inventory("campaign"), POTION)).toBe(false);
    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
  });

  it("clamps restoration to missing HP and never overheals", () => {
    const h = openCampaignEquipScreen();
    const maxHp = maxHpOf(h.manager);
    setCurrentHp("campaign", maxHp - 3);
    h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });

    h.manager.transition({ type: "request_use_item", instanceId: POTION });
    h.manager.transition({
      type: "confirm_use_item", instanceId: POTION, unitTemplateId: UNIT_ID,
    });

    // Full HP is stored as null, never as a number equal to max.
    expect(currentHp("campaign")).toBeNull();
  });

  it("refuses a full-health target, keeps the potion, and offers no dialog", () => {
    const h = openCampaignEquipScreen();

    expect(equipPhase(h.manager).itemUsage[POTION])
      .toEqual({ canUse: false, reason: "unit_full_hp" });

    const before = inventory("campaign");
    const result = h.manager.transition({ type: "request_use_item", instanceId: POTION });

    expect(result).toEqual({ status: "rejected" });
    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
    expect(inventory("campaign")).toBe(before);
  });

  it("commits nothing when the target becomes full between request and confirm", () => {
    const h = openCampaignEquipScreen();
    const maxHp = maxHpOf(h.manager);
    setCurrentHp("campaign", maxHp - 5);
    h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });

    h.manager.transition({ type: "request_use_item", instanceId: POTION });
    expect(equipPhase(h.manager).pendingItemUsePrompt).not.toBeNull();

    // Another route heals the character to full while the dialog is open.
    setCurrentHp("campaign", null);

    h.manager.transition({
      type: "confirm_use_item", instanceId: POTION, unitTemplateId: UNIT_ID,
    });

    // Confirmation re-evaluates the live session: the potion survives.
    expect(currentHp("campaign")).toBeNull();
    expect(inventory("campaign").instances[POTION]).toBeDefined();
  });

  it("heals identically in debug, in isolation, and a reset restores the potion", () => {
    const campaign = openCampaignEquipScreen();
    const debug = openDebugEquipScreen();
    const maxHp = maxHpOf(debug.manager);

    setCurrentHp("debug", maxHp - 30);
    debug.manager.transition({ type: "switch_debug_unit", templateId: UNIT_ID });
    debug.manager.transition({ type: "request_use_item", instanceId: POTION });
    debug.manager.transition({
      type: "confirm_use_item", instanceId: POTION, unitTemplateId: UNIT_ID,
    });

    expect(currentHp("debug")).toBe(maxHp - 20);
    expect(inventory("debug").instances[POTION]).toBeUndefined();

    // The campaign tree is untouched, potion included.
    expect(currentHp("campaign")).toBeNull();
    expect(inventory("campaign").instances[POTION]).toBeDefined();
    void campaign;

    debug.manager.transition({ type: "reset_debug_session" });
    expect(inventory("debug").instances[POTION]).toBeDefined();
  });

  it("persists healed HP into the next battle setup", () => {
    const h = openDebugEquipScreen();
    const maxHp = maxHpOf(h.manager);
    setCurrentHp("debug", maxHp - 30);
    h.manager.transition({ type: "switch_debug_unit", templateId: UNIT_ID });

    h.manager.transition({ type: "request_use_item", instanceId: POTION });
    h.manager.transition({
      type: "confirm_use_item", instanceId: POTION, unitTemplateId: UNIT_ID,
    });

    h.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);

    const runtime = requireBattleRuntimeForPhase(h.manager.getPhase());
    const warrior = [...runtime.state.units.values()].find(u => u.templateId === UNIT_ID)!;
    expect(warrior.hp).toBe(maxHp - 20);
  });
});

/**
 * The equipment screen used to display MAX HP on both sides of the `x / y` row, so a wounded
 * character read as fully healed while the potion preview beside it reported the real HP.
 * These cases pin the displayed value to the persistent roster, through the real pipeline.
 */
describe("the equipment screen displays persistent current HP", () => {
  /**
   * `setCurrentHp` writes straight through the store and does NOT run the pipeline, so the
   * committed phase still holds the previous snapshot. Rebuilding is a real transition:
   * `open_equip_screen` is accepted only from world_map/camp, so the in-screen refresh is
   * `switch_equip_unit` (campaign) / `switch_debug_unit` (debug).
   */
  const SOURCES = [
    {
      name: "campaign" as const,
      open: () => openCampaignEquipScreen(),
      refresh: (h: { manager: PhaseManagerClass }) =>
        h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID }),
    },
    {
      name: "debug" as const,
      open: () => openDebugEquipScreen(),
      refresh: (h: { manager: PhaseManagerClass }) =>
        h.manager.transition({ type: "switch_debug_unit", templateId: UNIT_ID }),
    },
  ];

  for (const source of SOURCES) {
    describe(source.name, () => {
      /** Rebuild and prove it happened — a rejected refresh must fail here, not later. */
      function refresh(h: { manager: PhaseManagerClass }): void {
        expect(source.refresh(h).status).toBe("applied");
        expect(equipPhase(h.manager).selectedUnitTemplateId).toBe(UNIT_ID);
      }

      it("shows full HP for an undamaged character and refuses the potion", () => {
        const h = source.open();

        expect(displayedHp(h.manager)).toBe(maxHpOf(h.manager));
        expect(equipPhase(h.manager).itemUsage[POTION])
          .toEqual({ canUse: false, reason: "unit_full_hp" });
        expect(h.manager.transition({ type: "request_use_item", instanceId: POTION }))
          .toEqual({ status: "rejected" });
      });

      it("shows the wound, and moves only the current half after a partial heal", () => {
        const h = source.open();
        const maxHp = maxHpOf(h.manager);
        setCurrentHp(source.name, maxHp - 30);
        refresh(h);

        expect(displayedHp(h.manager)).toBe(maxHp - 30);

        h.manager.transition({ type: "request_use_item", instanceId: POTION });
        h.manager.transition({
          type: "confirm_use_item", instanceId: POTION, unitTemplateId: UNIT_ID,
        });

        expect(displayedHp(h.manager)).toBe(Math.min(maxHp - 30 + POTION_AMOUNT, maxHp));
        expect(maxHpOf(h.manager)).toBe(maxHp);
      });

      it("reaches full display after healing to the cap, and the potion is gone", () => {
        const h = source.open();
        const maxHp = maxHpOf(h.manager);
        setCurrentHp(source.name, maxHp - 5);
        refresh(h);

        h.manager.transition({ type: "request_use_item", instanceId: POTION });
        h.manager.transition({
          type: "confirm_use_item", instanceId: POTION, unitTemplateId: UNIT_ID,
        });

        expect(displayedHp(h.manager)).toBe(maxHp);
        // The consumed instance leaves the backpack entirely, so its usage entry is ABSENT —
        // it is not reported with a refusal reason. (`unit_full_hp` is covered above, with an
        // unconsumed potion against a full-health character.)
        expect(equipPhase(h.manager).itemUsage[POTION]).toBeUndefined();
        expect(isReferencedAnywhere(inventory(source.name), POTION)).toBe(false);

        expect(h.manager.transition({ type: "request_use_item", instanceId: POTION }))
          .toEqual({ status: "rejected" });
        expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
      });
    });
  }

  describe("across a victory level-up", () => {
    /** The level-6 maximum, from the same rule battle exit uses — never a literal. */
    function maxHpAtLevel(level: number): number {
      const session = PlayerSessionStore.getSession("debug");
      const unit = session.roster.units[UNIT_ID];
      return resolvePlayerMaxHpForLevel({
        blueprint: PLAYER_UNITS.find(u => u.templateId === UNIT_ID)!,
        level,
        chosenUpgrades: unit.chosenUpgrades,
        permanentBonuses: unit.permanentBonuses,
        itemContainers: session.inventory.containers,
        itemInstances: session.inventory.instances,
      });
    }

    /** Levels the warrior to 6 through the production persistence rule. */
    function levelUpToSix(newMaxHp: number): void {
      const session = PlayerSessionStore.getSession("debug");
      PlayerSessionStore.replaceRoster("debug", {
        units: applyVictoryLevelUpPersistence(session.roster.units, [
          { templateId: UNIT_ID, newLevel: 6, newMaxHp },
        ]),
      });
    }

    it("keeps a wound through the level-up, then heals it", () => {
      const h = openDebugEquipScreen(5);
      const beforeMax = maxHpOf(h.manager);
      setCurrentHp("debug", beforeMax - 3);

      const nextMax = maxHpAtLevel(6);
      levelUpToSix(nextMax);
      h.manager.transition({ type: "switch_debug_unit", templateId: UNIT_ID });

      expect(nextMax).toBeGreaterThan(beforeMax);
      expect(maxHpOf(h.manager)).toBe(nextMax);
      // The level-up raises the ceiling; it does not heal, and the wound survives it.
      expect(displayedHp(h.manager)).toBe(beforeMax - 3);

      h.manager.transition({ type: "request_use_item", instanceId: POTION });
      h.manager.transition({
        type: "confirm_use_item", instanceId: POTION, unitTemplateId: UNIT_ID,
      });

      expect(displayedHp(h.manager)).toBe(Math.min(beforeMax - 3 + POTION_AMOUNT, nextMax));
    });

    it("stays at full display for an undamaged character, and refuses the potion", () => {
      const h = openDebugEquipScreen(5);

      levelUpToSix(maxHpAtLevel(6));
      h.manager.transition({ type: "switch_debug_unit", templateId: UNIT_ID });

      // currentHp stays null across the level-up, so full HP tracks the NEW maximum.
      expect(displayedHp(h.manager)).toBe(maxHpOf(h.manager));
      expect(equipPhase(h.manager).itemUsage[POTION])
        .toEqual({ canUse: false, reason: "unit_full_hp" });
    });
  });
});

describe("a pending request never outlives the screen that owns it", () => {
  it("is dropped when the selected character changes", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "request_use_item", instanceId: VITALITY });

    h.manager.transition({ type: "switch_equip_unit", templateId: "healer" });
    h.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });

    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();

    // Confirming the original ids now does nothing.
    const before = inventory("campaign");
    h.manager.transition({
      type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });
    expect(bonuses("campaign")).toEqual({});
    expect(inventory("campaign")).toBe(before);
  });

  it("is dropped when the screen is left and re-entered", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "request_use_item", instanceId: VITALITY });

    h.manager.transition({ type: "close_equip_screen" });
    h.manager.transition({ type: "open_equip_screen", unitTemplateId: UNIT_ID });

    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();
    expect(bonuses("campaign")).toEqual({});
  });

  it("is dropped by a debug reset, though the reset recreates the very same instance id", () => {
    const h = openDebugEquipScreen();
    h.manager.transition({ type: "request_use_item", instanceId: VITALITY });
    expect(equipPhase(h.manager).pendingItemUsePrompt).not.toBeNull();

    h.manager.transition({ type: "reset_debug_session" });

    // Same phase, same selected character, same authored instance id — only ownership by
    // session plus the explicit lifecycle disposal distinguishes the stale request.
    expect(equipPhase(h.manager).selectedUnitTemplateId).toBe(UNIT_ID);
    expect(inventory("debug").instances[VITALITY]).toBeDefined();
    expect(equipPhase(h.manager).pendingItemUsePrompt).toBeNull();

    const before = inventory("debug");
    h.manager.transition({
      type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });
    expect(bonuses("debug")).toEqual({});
    expect(inventory("debug")).toBe(before);
  });

  it("commits nothing when the item disappears between request and confirm", () => {
    const h = openCampaignEquipScreen();
    h.manager.transition({ type: "request_use_item", instanceId: VITALITY });

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
      type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
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

    expect(equipPhase(h.manager).itemUsage[VITALITY])
      .toEqual({ canUse: false, reason: "unit_dead" });

    const result = h.manager.transition({ type: "request_use_item", instanceId: VITALITY });

    expect(result).toEqual({ status: "rejected" });
    expect(inventory("campaign").instances[VITALITY]).toBeDefined();
  });
});

describe("campaign and debug behave identically and stay isolated", () => {
  it("produces the same roster and inventory delta in both sessions", () => {
    const campaign = openCampaignEquipScreen();
    campaign.manager.transition({ type: "request_use_item", instanceId: VITALITY });
    campaign.manager.transition({
      type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    const debug = openDebugEquipScreen();
    debug.manager.transition({ type: "request_use_item", instanceId: VITALITY });
    debug.manager.transition({
      type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(bonuses("debug")).toEqual(bonuses("campaign"));
    expect(inventory("campaign").instances[VITALITY]).toBeUndefined();
    expect(inventory("debug").instances[VITALITY]).toBeUndefined();
  });

  it("leaves the other storage tree untouched", () => {
    const h = openDebugEquipScreen();
    const campaignBonusesBefore = bonuses("campaign");

    h.manager.transition({ type: "request_use_item", instanceId: VITALITY });
    h.manager.transition({
      type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
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
    campaign.manager.transition({ type: "request_use_item", instanceId: VITALITY });

    const debug = openDebugEquipScreen();
    expect(equipPhase(debug.manager).pendingItemUsePrompt).toBeNull();

    debug.manager.transition({ type: "request_use_item", instanceId: VITALITY });

    // Each still sees only its own.
    campaign.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });
    expect(equipPhase(campaign.manager).pendingItemUsePrompt).toMatchObject({
      instanceId: VITALITY,
    });
    expect(equipPhase(debug.manager).pendingItemUsePrompt).toMatchObject({ instanceId: VITALITY });

    // Cancelling on the debug manager disposes only the debug request.
    debug.manager.transition({ type: "cancel_use_item" });
    expect(equipPhase(debug.manager).pendingItemUsePrompt).toBeNull();

    campaign.manager.transition({ type: "switch_equip_unit", templateId: UNIT_ID });
    expect(equipPhase(campaign.manager).pendingItemUsePrompt).not.toBeNull();
  });

  it("lets each manager commit only against its own session", () => {
    const campaign = openCampaignEquipScreen();
    const debug = openDebugEquipScreen();

    debug.manager.transition({ type: "request_use_item", instanceId: VITALITY });
    debug.manager.transition({
      type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(bonuses("debug")).toEqual({ hp: 5 });
    expect(bonuses("campaign")).toEqual({});

    // The campaign manager's own request is unaffected by the debug commit.
    campaign.manager.transition({ type: "request_use_item", instanceId: VITALITY });
    campaign.manager.transition({
      type: "confirm_use_item", instanceId: VITALITY, unitTemplateId: UNIT_ID,
    });

    expect(bonuses("campaign")).toEqual({ hp: 5 });
  });
});
