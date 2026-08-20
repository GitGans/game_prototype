import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../../src/core/GameState";
import { PlayerSessionStore } from "../../src/core/playerSessionStore";
import { applyEquipmentPhaseAction } from "../../src/core/phaseHandlers/inventoryPhaseHandler";
import { createDebugPlayerSession } from "../../src/core/debugPlayerSession";
import { initCampaignState } from "../../src/core/initCampaignState";
import { requireSharedBackpack } from "../../src/inventory";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";
import type { DebugSessionConfig } from "../../src/core/DebugBattleState";
import type { PlayerSessionSource } from "../../src/core/playerSessionState";

const UNIT_ID = PLAYER_UNITS[0].templateId;

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

/** Drops a fresh unrestricted "bronze_ring" instance into the backpack for the given source. */
function seedBackpackRing(source: PlayerSessionSource, instanceId: string): void {
  const session = PlayerSessionStore.getSession(source);
  const backpack = requireSharedBackpack(session.inventory);
  const freeSlot = Object.keys(session.inventory.instances).length; // simple unused slot key
  const nextInventory = {
    instances: { ...session.inventory.instances, [instanceId]: { id: instanceId, definitionId: 'bronze_ring' } },
    containers: {
      ...session.inventory.containers,
      [backpack.id]: { ...backpack, slots: { ...backpack.slots, [String(freeSlot)]: instanceId } },
    },
  };
  PlayerSessionStore.replaceInventory(source, nextInventory);
}

describe("applyEquipmentPhaseAction", () => {
  beforeEach(() => {
    GameState.setCampaignState(freshCampaign());
    GameState.setDebugState({ session: createDebugPlayerSession({ config: debugConfig(), playerUnits: PLAYER_UNITS, itemCatalog: ITEM_CATALOG }), initialConfig: debugConfig() });
  });

  it("equivalent campaign and debug sessions produce equivalent successful equip results", () => {
    seedBackpackRing('campaign', 'ring_c');
    seedBackpackRing('debug', 'ring_d');

    applyEquipmentPhaseAction({ source: 'campaign', action: { type: 'equip_item', instanceId: 'ring_c', unitTemplateId: UNIT_ID } });
    applyEquipmentPhaseAction({ source: 'debug', action: { type: 'equip_item', instanceId: 'ring_d', unitTemplateId: UNIT_ID } });

    const campaignEquip = PlayerSessionStore.getSession('campaign').inventory.containers[`equip_${UNIT_ID}`];
    const debugEquip = PlayerSessionStore.getSession('debug').inventory.containers[`equip_${UNIT_ID}`];
    expect(campaignEquip.slots['ring_1']).toBe('ring_c');
    expect(debugEquip.slots['ring_1']).toBe('ring_d');
  });

  it("a successful debug equip mutation does not change campaign inventory", () => {
    seedBackpackRing('debug', 'ring_d');
    const campaignBefore = GameState.getCampaignState().inventory;
    applyEquipmentPhaseAction({ source: 'debug', action: { type: 'equip_item', instanceId: 'ring_d', unitTemplateId: UNIT_ID } });
    expect(GameState.getCampaignState().inventory).toBe(campaignBefore);
  });

  it("a successful campaign equip mutation does not change debug inventory", () => {
    seedBackpackRing('campaign', 'ring_c');
    const debugBefore = GameState.getDebugState()!.session.inventory;
    applyEquipmentPhaseAction({ source: 'campaign', action: { type: 'equip_item', instanceId: 'ring_c', unitTemplateId: UNIT_ID } });
    expect(GameState.getDebugState()!.session.inventory).toBe(debugBefore);
  });

  it("unequip resolves a shared backpack whose technical id is not backpack_shared", () => {
    // Rekey the campaign's shared backpack to a non-conventional technical id.
    const session = PlayerSessionStore.getSession('campaign');
    const oldBackpack = requireSharedBackpack(session.inventory);
    const renamed = { ...oldBackpack, id: 'loot_sack' };
    const { [oldBackpack.id]: _removed, ...restContainers } = session.inventory.containers;
    PlayerSessionStore.replaceInventory('campaign', {
      instances: session.inventory.instances,
      containers: { ...restContainers, loot_sack: renamed },
    });
    seedBackpackRing('campaign', 'ring_c');
    applyEquipmentPhaseAction({ source: 'campaign', action: { type: 'equip_item', instanceId: 'ring_c', unitTemplateId: UNIT_ID } });

    applyEquipmentPhaseAction({ source: 'campaign', action: { type: 'unequip_item', unitTemplateId: UNIT_ID, slot: 'ring_1' } });
    const after = PlayerSessionStore.getSession('campaign').inventory;
    expect(Object.values(after.containers['loot_sack'].slots)).toContain('ring_c');
    expect(after.containers[`equip_${UNIT_ID}`].slots['ring_1']).toBeUndefined();
  });

  it("an invalid unit id does not modify either session", () => {
    seedBackpackRing('campaign', 'ring_c');
    const before = GameState.getCampaignState().inventory;
    applyEquipmentPhaseAction({ source: 'campaign', action: { type: 'equip_item', instanceId: 'ring_c', unitTemplateId: 'not_a_real_unit' } });
    expect(GameState.getCampaignState().inventory).toBe(before);
  });

  it("an invalid concrete slot does not modify inventory", () => {
    const before = GameState.getCampaignState().inventory;
    applyEquipmentPhaseAction({ source: 'campaign', action: { type: 'unequip_item', unitTemplateId: UNIT_ID, slot: 'not_a_slot' } });
    expect(GameState.getCampaignState().inventory).toBe(before);
  });

  it("the item-level pseudo-slot 'ring' is rejected as an unequip target", () => {
    const before = GameState.getCampaignState().inventory;
    applyEquipmentPhaseAction({ source: 'campaign', action: { type: 'unequip_item', unitTemplateId: UNIT_ID, slot: 'ring' } });
    expect(GameState.getCampaignState().inventory).toBe(before);
  });

  it("a failed domain operation does not replace inventory", () => {
    // Slot is empty — unequipItem returns ok:false — inventory must remain the same reference.
    const before = GameState.getCampaignState().inventory;
    applyEquipmentPhaseAction({ source: 'campaign', action: { type: 'unequip_item', unitTemplateId: UNIT_ID, slot: 'helmet' } });
    expect(GameState.getCampaignState().inventory).toBe(before);
  });
});
