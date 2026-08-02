import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../../src/core/GameState';
import { applyBattleLifecyclePhaseAction } from '../../src/core/phaseHandlers/battlePhaseHandler';
import { createDebugPlayerSession } from '../../src/core/debugPlayerSession';
import { initCampaignState } from '../../src/core/initCampaignState';
import { PLAYER_UNITS } from '../../src/data/units';
import { ITEM_CATALOG } from '../../src/data/itemDefinitions';
import { CAMPAIGN_STARTING_ITEMS } from '../../src/data/startingInventoryDefinitions';
import { MAP_DEFINITIONS } from '../../src/data/mapDefinitions';
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from '../../src/data/campaignInitialStateDefinition';
import { makeUnit } from '../battle/helpers/units';
import { makeBattleStateFromUnits } from '../battle/helpers/battleState';
import { coord } from '../battle/helpers/coords';
import type { Unit } from '../../src/battle/types';
import type { DebugSessionConfig } from '../../src/core/DebugBattleState';

const TEMPLATE_ID = 'soldier';
const ANCHOR      = coord('player', 1, 2);
const BEGIN       = { type: 'battle_begin_combat' } as const;

const debugConfig = (): DebugSessionConfig =>
  ({ level: 5, startingItems: CAMPAIGN_STARTING_ITEMS, initialCampUnitIds: [] });

const playerUnit = (id: string, overrides: Partial<Unit> = {}) =>
  makeUnit({ id, templateId: TEMPLATE_ID, side: 'player', ...overrides });

// A placement state that CAN begin combat: one living player unit on the field.
const beginnableState = () => makeBattleStateFromUnits({
  field: [{ unit: playerUnit('p1'), anchor: ANCHOR }],
}, { phase: 'placement' });

// A placement state that CANNOT begin combat: only a corpse holds the field.
const rejectedState = () => makeBattleStateFromUnits({
  field: [{ unit: playerUnit('p1', { lifeState: 'dead', hp: 0 }), anchor: ANCHOR }],
}, { phase: 'placement' });

const campaignRoster = () => GameState.getCampaignState().roster;
const debugRoster    = () => GameState.requireDebugState().session.roster;

describe('applyBattleLifecyclePhaseAction — placement persistence routing', () => {
  beforeEach(() => {
    GameState.setCampaignState(initCampaignState({
      playerUnits:    PLAYER_UNITS,
      itemCatalog:    ITEM_CATALOG,
      startingItems:  CAMPAIGN_STARTING_ITEMS,
      mapDefinitions: MAP_DEFINITIONS,
      initialState:   CAMPAIGN_INITIAL_STATE_DEFINITION,
    }));
    GameState.setDebugState({
      session: createDebugPlayerSession({
        config: debugConfig(), playerUnits: PLAYER_UNITS, itemCatalog: ITEM_CATALOG,
      }),
      initialConfig: debugConfig(),
    });
  });

  it("source 'debug' writes the debug roster and leaves campaign untouched", () => {
    const campaignBefore = campaignRoster();

    const result = applyBattleLifecyclePhaseAction({ source: 'debug', state: beginnableState(), action: BEGIN });

    expect(result.state.phase).toBe('select_target');
    expect(debugRoster().units[TEMPLATE_ID].lastPlacement).toEqual(ANCHOR);
    expect(campaignRoster()).toBe(campaignBefore);
    expect(campaignBefore.units[TEMPLATE_ID].lastPlacement).toBeNull();
  });

  it("source 'campaign' produces the same placement and leaves debug untouched", () => {
    const debugBefore = debugRoster();

    applyBattleLifecyclePhaseAction({ source: 'campaign', state: beginnableState(), action: BEGIN });

    expect(campaignRoster().units[TEMPLATE_ID].lastPlacement).toEqual(ANCHOR);
    expect(debugRoster()).toBe(debugBefore);
    expect(debugBefore.units[TEMPLATE_ID].lastPlacement).toBeNull();
  });

  it('writes no roster when begin-combat is rejected', () => {
    const campaignBefore = campaignRoster();
    const debugBefore    = debugRoster();

    const result = applyBattleLifecyclePhaseAction({ source: 'debug', state: rejectedState(), action: BEGIN });

    expect(result.state.phase).toBe('placement');
    expect(debugRoster()).toBe(debugBefore);
    expect(campaignRoster()).toBe(campaignBefore);
  });
});
