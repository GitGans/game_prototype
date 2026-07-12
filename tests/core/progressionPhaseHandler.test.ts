import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../../src/core/GameState";
import { PlayerSessionStore } from "../../src/core/playerSessionStore";
import { applyChooseUpgradePhaseAction } from "../../src/core/phaseHandlers/progressionPhaseHandler";
import { createDebugPlayerSession } from "../../src/core/debugPlayerSession";
import { initCampaignState } from "../../src/core/initCampaignState";
import { PLAYER_UNITS } from "../../src/data/units";
import { ITEM_CATALOG } from "../../src/data/itemDefinitions";
import { CAMPAIGN_STARTING_ITEMS } from "../../src/data/startingInventoryDefinitions";
import { MAP_DEFINITIONS } from "../../src/data/mapDefinitions";
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from "../../src/data/campaignInitialStateDefinition";
import type { DebugSessionConfig } from "../../src/core/DebugBattleState";
import type { PlayerSessionSource } from "../../src/core/playerSessionState";

const blueprint = PLAYER_UNITS.find(u => (u.upgradeTiers?.length ?? 0) > 0)!;
const UNIT_ID = blueprint.templateId;
const tier = blueprint.upgradeTiers![0];
const option = tier.options[0];

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
  return { level: tier.unlocksAtLevel, startingItems: CAMPAIGN_STARTING_ITEMS, initialCampUnitIds: [] };
}

/** Sets the unit's level high enough to unlock the fixture tier, for the given session. */
function raiseLevel(source: PlayerSessionSource): void {
  const session = PlayerSessionStore.getSession(source);
  const unitState = session.roster.units[UNIT_ID];
  PlayerSessionStore.replaceRoster(source, {
    units: { ...session.roster.units, [UNIT_ID]: { ...unitState, level: tier.unlocksAtLevel } },
  });
}

describe("applyChooseUpgradePhaseAction", () => {
  beforeEach(() => {
    GameState.setCampaignState(freshCampaign());
    GameState.setDebugState({
      session: createDebugPlayerSession({ config: debugConfig(), playerUnits: PLAYER_UNITS, itemCatalog: ITEM_CATALOG }),
      initialConfig: debugConfig(),
    });
    raiseLevel('campaign');
    raiseLevel('debug');
  });

  it("a campaign-sourced choice mutates only the campaign roster", () => {
    const debugBefore = GameState.getDebugState()!.session.roster;
    applyChooseUpgradePhaseAction({
      source: 'campaign',
      unitTemplateId: UNIT_ID,
      action: { type: 'choose_upgrade', tierId: tier.unlocksAtLevel, upgradeId: option.id },
    });
    expect(GameState.getCampaignState().roster.units[UNIT_ID].chosenUpgrades[tier.unlocksAtLevel]).toBe(option.id);
    expect(GameState.getDebugState()!.session.roster).toBe(debugBefore);
  });

  it("a debug-sourced choice mutates only the debug roster", () => {
    const campaignBefore = GameState.getCampaignState().roster;
    applyChooseUpgradePhaseAction({
      source: 'debug',
      unitTemplateId: UNIT_ID,
      action: { type: 'choose_upgrade', tierId: tier.unlocksAtLevel, upgradeId: option.id },
    });
    expect(GameState.getDebugState()!.session.roster.units[UNIT_ID].chosenUpgrades[tier.unlocksAtLevel]).toBe(option.id);
    expect(GameState.getCampaignState().roster).toBe(campaignBefore);
  });

  it("a failed domain operation does not replace roster state", () => {
    const before = GameState.getCampaignState().roster;
    applyChooseUpgradePhaseAction({
      source: 'campaign',
      unitTemplateId: 'not_a_real_unit',
      action: { type: 'choose_upgrade', tierId: tier.unlocksAtLevel, upgradeId: option.id },
    });
    expect(GameState.getCampaignState().roster).toBe(before);
  });

  it("equivalent campaign and debug rosters produce equivalent results", () => {
    const campaignResult = applyChooseUpgradePhaseAction({
      source: 'campaign',
      unitTemplateId: UNIT_ID,
      action: { type: 'choose_upgrade', tierId: tier.unlocksAtLevel, upgradeId: option.id },
    });
    const debugResult = applyChooseUpgradePhaseAction({
      source: 'debug',
      unitTemplateId: UNIT_ID,
      action: { type: 'choose_upgrade', tierId: tier.unlocksAtLevel, upgradeId: option.id },
    });
    expect(campaignResult.ok).toBe(debugResult.ok);
    if (campaignResult.ok && debugResult.ok) {
      expect(campaignResult.nextRoster.units[UNIT_ID].chosenUpgrades)
        .toEqual(debugResult.nextRoster.units[UNIT_ID].chosenUpgrades);
    }
  });
});
