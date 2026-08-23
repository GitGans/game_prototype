import { describe, it, expect, afterEach } from "vitest";
import {
  createLifecycleHarness,
  resetGameStateBetweenTests,
  ORC_PATROL_ENEMY_GROUP_ID,
  ORC_PATROL_TRIGGER_POS,
  DEBUG_MUTATION_PROBE_UNIT_ID,
  FIXTURE_MAP_ID,
} from "./helpers/phaseManagerLifecycleHarness";
import { GameState } from "../../src/core/GameState";

/**
 * Characterizes campaign/debug session lifecycle and isolation as observed
 * through `PhaseManager.transition()` and authoritative `GameState` reads.
 *
 * Every test builds its own campaign with `new_game` — none depends on state
 * left behind by another.
 */
describe("PhaseManager session lifecycle", () => {
  afterEach(resetGameStateBetweenTests);

  // Contract 1
  it("new_game creates a fresh campaign and disposes debug session + battle runtime", () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();
    const campaignBefore = GameState.getCampaignState();

    h.openDebugSession(1);
    h.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
    expect(GameState.getDebugState()).not.toBeNull();
    expect(GameState.hasBattleRuntime()).toBe(true);

    h.startNewCampaign();

    expect(GameState.getDebugState()).toBeNull();
    expect(GameState.hasBattleRuntime()).toBe(false);
    expect(GameState.hasCampaignState()).toBe(true);
    expect(GameState.getCampaignState()).not.toBe(campaignBefore);
  });

  // Contract 2
  it("init_debug creates a debug session at the requested level without touching the campaign", () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();
    const campaignBefore = GameState.getCampaignState();

    h.openDebugSession(3);

    const debugState = GameState.requireDebugState();
    expect(debugState.initialConfig.level).toBe(3);
    expect(GameState.getCampaignState()).toBe(campaignBefore);
  });

  // Contract 3
  it("campaign and debug sessions share no mutable references", () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();
    h.openDebugSession(1);

    const campaign = GameState.getCampaignState();
    const debug = GameState.requireDebugState();

    // Containers are distinct objects, not aliases.
    expect(debug.session.roster).not.toBe(campaign.roster);
    expect(debug.session.roster.units).not.toBe(campaign.roster.units);
    expect(debug.session.inventory).not.toBe(campaign.inventory);
    expect(debug.session.inventory.instances).not.toBe(
      campaign.inventory.instances,
    );
    expect(debug.session.inventory.containers).not.toBe(
      campaign.inventory.containers,
    );

    // Every unit record reachable in both trees is a distinct object.
    for (const templateId of Object.keys(campaign.roster.units)) {
      const debugUnit = debug.session.roster.units[templateId];
      if (!debugUnit) continue;
      expect(debugUnit).not.toBe(campaign.roster.units[templateId]);
    }

    // Every item instance/container present in both is a distinct object.
    for (const instanceId of Object.keys(campaign.inventory.instances)) {
      const debugInstance = debug.session.inventory.instances[instanceId];
      if (!debugInstance) continue;
      expect(debugInstance).not.toBe(campaign.inventory.instances[instanceId]);
    }
    for (const containerId of Object.keys(campaign.inventory.containers)) {
      const debugContainer = debug.session.inventory.containers[containerId];
      if (!debugContainer) continue;
      expect(debugContainer).not.toBe(
        campaign.inventory.containers[containerId],
      );
    }

    // A debug mutation must not bleed into campaign state.
    const campaignRosterBefore = campaign.roster;
    const campaignInventoryBefore = campaign.inventory;
    const campaignUnitsSnapshot = JSON.parse(
      JSON.stringify(campaign.roster.units),
    );

    h.manager.transition({
      type: "toggle_camp_unit",
      templateId: DEBUG_MUTATION_PROBE_UNIT_ID,
    });

    const campaignAfter = GameState.getCampaignState();
    expect(campaignAfter.roster).toBe(campaignRosterBefore);
    expect(campaignAfter.inventory).toBe(campaignInventoryBefore);
    expect(campaignAfter.roster.units).toEqual(campaignUnitsSnapshot);
  });

  // Contract 4
  it("reset_debug_session is mutation-only and rebuilds the session from initialConfig", () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();
    h.openDebugSession(1);

    const campaignBefore = GameState.getCampaignState();
    const pristineDebugSession = GameState.requireDebugState().session;

    const pristineUnits = JSON.parse(
      JSON.stringify(pristineDebugSession.roster.units),
    );
    const pristineInventory = JSON.parse(
      JSON.stringify(pristineDebugSession.inventory),
    );

    // Mutate the debug roster through the public transition pipeline.
    h.manager.transition({
      type: "toggle_camp_unit",
      templateId: DEBUG_MUTATION_PROBE_UNIT_ID,
    });

    // Mutate the debug inventory through the public transition pipeline.
    h.manager.transition({
      type: "equip_item",
      instanceId: "item_start_bronze_ring",
      unitTemplateId: "soldier",
    });

    const mutated = GameState.requireDebugState();

    expect(
      mutated.session.roster.units[DEBUG_MUTATION_PROBE_UNIT_ID].isInCamp,
    ).toBe(true);
    expect(mutated.session.roster.units).not.toEqual(pristineUnits);

    // Prove that the inventory mutation really succeeded.
    expect(
      mutated.session.inventory.containers.backpack_debug.slots["0"],
    ).toBeUndefined();
    expect(
      mutated.session.inventory.containers.equip_soldier.slots.ring_1,
    ).toBe("item_start_bronze_ring");
    expect(mutated.session.inventory).not.toEqual(pristineInventory);

    // References which must not survive reset.
    const rosterBeforeReset = mutated.session.roster;
    const rosterUnitsBeforeReset = rosterBeforeReset.units;
    const inventoryBeforeReset = mutated.session.inventory;
    const instancesBeforeReset = inventoryBeforeReset.instances;
    const containersBeforeReset = inventoryBeforeReset.containers;

    h.manager.transition({ type: "reset_debug_session" });

    // Mutation-only transition: the screen remains open.
    expect(h.manager.getPhase().type).toBe("debug_equip_screen");

    const afterReset = GameState.requireDebugState();

    // Top-level session domains are rebuilt.
    expect(afterReset.session.roster).not.toBe(rosterBeforeReset);
    expect(afterReset.session.inventory).not.toBe(inventoryBeforeReset);

    // Roster content is restored and nested records are fresh.
    expect(afterReset.session.roster.units).toEqual(pristineUnits);
    expect(afterReset.session.roster.units).not.toBe(rosterUnitsBeforeReset);
    expect(
      afterReset.session.roster.units[DEBUG_MUTATION_PROBE_UNIT_ID].isInCamp,
    ).toBe(false);

    for (const templateId of Object.keys(rosterUnitsBeforeReset)) {
      expect(afterReset.session.roster.units[templateId]).not.toBe(
        rosterUnitsBeforeReset[templateId],
      );
    }

    // Inventory content is restored and the equipment mutation is gone.
    expect(afterReset.session.inventory).toEqual(pristineInventory);
    expect(
      afterReset.session.inventory.containers.backpack_debug.slots["0"],
    ).toBe("item_start_bronze_ring");
    expect(
      afterReset.session.inventory.containers.equip_soldier.slots.ring_1,
    ).toBeUndefined();

    // Nested inventory structures must also be newly created.
    expect(afterReset.session.inventory.instances).not.toBe(
      instancesBeforeReset,
    );
    expect(afterReset.session.inventory.containers).not.toBe(
      containersBeforeReset,
    );

    for (const instanceId of Object.keys(instancesBeforeReset)) {
      expect(afterReset.session.inventory.instances[instanceId]).not.toBe(
        instancesBeforeReset[instanceId],
      );
    }

    for (const containerId of Object.keys(containersBeforeReset)) {
      expect(afterReset.session.inventory.containers[containerId]).not.toBe(
        containersBeforeReset[containerId],
      );
    }

    // Debug reset must not affect campaign storage.
    expect(GameState.getCampaignState()).toBe(campaignBefore);
  });

  // Contract 5
  it("reset_debug_session during battle is rejected without any mutation or scene sync", () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();
    h.openDebugSession(1);
    h.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);

    const phaseBefore = h.manager.getPhase();
    const debugBefore = GameState.getDebugState();
    const runtimeBefore = GameState.getBattleRuntime();
    const syncCallsBefore = h.sync.mock.calls.length;

    h.manager.transition({ type: "reset_debug_session" });

    expect(h.manager.getPhase()).toBe(phaseBefore);
    expect(GameState.getDebugState()).toBe(debugBefore);
    expect(GameState.getBattleRuntime()).toBe(runtimeBefore);
    expect(h.sync.mock.calls.length).toBe(syncCallsBefore);
  });

  // Contract 6
  it("exit_to_menu from debug_equip_screen disposes debug state and leaves the campaign alone", () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();
    const campaignBefore = GameState.getCampaignState();
    h.openDebugSession(1);

    h.manager.transition({ type: "exit_to_menu" });

    expect(GameState.getDebugState()).toBeNull();
    expect(GameState.getCampaignState()).toBe(campaignBefore);
  });

  // Contract 7
  it("exit_to_menu from an active debug battle disposes both debug state and battle runtime", () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();
    h.openDebugSession(1);
    h.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
    expect(GameState.hasBattleRuntime()).toBe(true);

    h.manager.transition({ type: "exit_to_menu" });

    expect(GameState.getDebugState()).toBeNull();
    expect(GameState.hasBattleRuntime()).toBe(false);
  });

  // Contract 8
  it("new_game from an active debug battle disposes debug/runtime and replaces campaign progress", () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();

    // Advance campaign progress so a stale campaign would be distinguishable.
    const startPos = GameState.getCampaignState().world.partyPos;
    const movedPos = { x: startPos.x, y: startPos.y - 1 };
    h.manager.transition({ type: "move_party", partyPos: movedPos });
    const progressedCampaign = GameState.getCampaignState();
    expect(progressedCampaign.world.partyPos).toEqual(movedPos);

    h.openDebugSession(1);
    h.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);

    h.startNewCampaign();

    expect(GameState.getDebugState()).toBeNull();
    expect(GameState.hasBattleRuntime()).toBe(false);

    const freshCampaign = GameState.getCampaignState();
    expect(freshCampaign).not.toBe(progressedCampaign);
    expect(freshCampaign.world.currentMapId).toBe(FIXTURE_MAP_ID);
    expect(freshCampaign.world.partyPos).toEqual(startPos);
  });
});
