import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GameState } from "../../src/core/GameState";
import {
  clearBattleRuntimeSlot,
  readBattleRuntimeSlot,
  writeBattleRuntimeSlot,
} from "../../src/core/battleRuntimeStorage";
import { initializeNewCampaign } from "../../src/core/campaignLifecycle";
import { initializeDebugSessionForLevel } from "../../src/core/debugLifecycle";
import {
  createBattleRuntimeContext,
  createEmptyBattleState,
} from "../../src/core/battleRuntimeContext";
import { PLAYER_UNITS } from "../../src/data/units";

/**
 * `campaignLifecycle` owns campaign *container* creation, the campaign-side sibling of
 * `debugLifecycle`. It exists so the five production data catalogs stay out of
 * `phaseActionEffects`, which decides WHEN a campaign is created but must not know what one is
 * made of.
 *
 * Scope is deliberately narrow: what a campaign contains is `initCampaignState`'s contract, and
 * the new-game lifecycle sequence around this call (clear debug, clear runtime, reset RNG) is
 * pinned by the Stage 2 session-lifecycle characterization suite. What is only observable here
 * is that repeated calls produce independent state and touch nothing else.
 */
describe("initializeNewCampaign", () => {
  beforeEach(() => {
    GameState.clearDebugState();
    clearBattleRuntimeSlot();
  });

  // The ownership test below intentionally LEAVES both resources installed — that is the
  // point of it. Without this, it would leak singleton state into whatever runs next.
  afterEach(() => {
    GameState.clearDebugState();
    clearBattleRuntimeSlot();
  });

  it("installs a campaign built from the production catalogs", () => {
    initializeNewCampaign();

    const campaign = GameState.getCampaignState();
    for (const bp of PLAYER_UNITS) {
      expect(campaign.roster.units[bp.templateId]).toBeDefined();
    }
    expect(campaign.world.subMapStates[campaign.world.currentMapId]).toBeDefined();
  });

  it("replaces existing progress with independently built state", () => {
    // No idempotent guard by design: "New Game" from the menu discards any run in progress.
    initializeNewCampaign();
    const first = GameState.getCampaignState();
    const templateId = PLAYER_UNITS[0].templateId;
    first.roster.units[templateId].level = 99;

    initializeNewCampaign();
    const second = GameState.getCampaignState();

    expect(second).not.toBe(first);
    expect(second.roster.units).not.toBe(first.roster.units);
    // The second campaign must not have inherited the first one's mutated record.
    expect(second.roster.units[templateId].level).not.toBe(99);
    expect(second.roster.units[templateId]).not.toBe(first.roster.units[templateId]);
  });

  it("preserves existing debug state and battle runtime by identity", () => {
    // Explicit setup rather than relying on an earlier test having installed a campaign:
    // getCampaignState() throws when none exists, and test-order coupling rots silently.
    initializeNewCampaign();
    const campaignBefore = GameState.getCampaignState();

    // Both resources must be genuinely POPULATED before the call. Asserting against an empty
    // GameState would restate the precondition and stay green even if initializeNewCampaign()
    // started clearing them — which is precisely the regression this test exists to catch.
    initializeDebugSessionForLevel(3);
    const debugBefore = GameState.requireDebugState();

    writeBattleRuntimeSlot(createBattleRuntimeContext({
      state: createEmptyBattleState(),
      participants: [],
      replaySetup: { enemyPlacements: [] },
      sessionSource: "debug",
    }));
    const runtimeBefore = readBattleRuntimeSlot();

    initializeNewCampaign();

    // Did its own job...
    expect(GameState.getCampaignState()).not.toBe(campaignBefore);

    // ...and only its own job. Identity, not structural equality: swapping either resource for
    // an equivalent object is an unauthorized lifecycle effect too. Clearing debug state,
    // disposing the runtime and resetting RNG belong to `phaseActionEffects`, which sequences
    // them around this call — doing any of them here would make `new_game` perform them twice.
    expect(GameState.getDebugState()).toBe(debugBefore);
    expect(readBattleRuntimeSlot()).not.toBeNull();
    expect(readBattleRuntimeSlot()).toBe(runtimeBefore);
  });
});
