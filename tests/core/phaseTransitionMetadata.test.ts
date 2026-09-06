import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { derivePhaseTransitionMetadata } from '../../src/core/phaseTransitionMetadata';
import { GameState } from '../../src/core/GameState';
import { initCampaignState } from '../../src/core/initCampaignState';
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from '../../src/data/campaignInitialStateDefinition';
import { MAP_DEFINITIONS } from '../../src/data/mapDefinitions';
import { PLAYER_UNITS } from '../../src/data/units';
import { ITEM_CATALOG } from '../../src/data/itemDefinitions';
import { CAMPAIGN_STARTING_ITEMS } from '../../src/data/startingInventoryDefinitions';
import type { CampaignState } from '../../src/campaign';
import { makeBattlePhase } from './helpers/phaseFixtures';
import {
  FIXTURE_MAP_ID,
  ORC_PATROL_TRIGGER_POS,
  ORC_PATROL_ENTITY_KEY,
  DEMON_PATROL_TRIGGER_POS,
  DEMON_PATROL_ENTITY_KEY,
} from './helpers/phaseManagerLifecycleHarness';

// test_01 carries exactly two mobs: orc_patrol at (2,2) and demon_patrol at (5,6).
// Clearing the map therefore means "the other one is already dead".

function installCampaign(): CampaignState {
  const campaign = initCampaignState({
    playerUnits: PLAYER_UNITS,
    itemCatalog: ITEM_CATALOG,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    mapDefinitions: MAP_DEFINITIONS,
    initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
  });
  GameState.setCampaignState(campaign);
  return campaign;
}

/** Marks one map entity dead through an immutable replacement, like the exit pipeline does. */
function killEntity(entityKey: string): void {
  const c = GameState.getCampaignState();
  const src = c.world.subMapStates[FIXTURE_MAP_ID];
  GameState.setCampaignState({
    ...c,
    world: {
      ...c.world,
      subMapStates: {
        ...c.world.subMapStates,
        [FIXTURE_MAP_ID]: {
          ...src,
          entityStates: { ...src.entityStates, [entityKey]: { alive: false } },
        },
      },
    },
  });
}

function campaignVictoryPhase(triggerPos = ORC_PATROL_TRIGGER_POS) {
  return makeBattlePhase({
    sessionSource: 'campaign',
    mapId: FIXTURE_MAP_ID,
    triggerPos,
  });
}

const VICTORY = { type: 'exit_battle', outcome: 'victory' } as const;

describe('derivePhaseTransitionMetadata', () => {
  beforeEach(() => {
    installCampaign();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('guards — no campaign read at all', () => {
    it('returns { mapCleared: false } for a non-exit_battle action', () => {
      const spy = vi.spyOn(GameState, 'getCampaignState');

      const result = derivePhaseTransitionMetadata(campaignVictoryPhase(), {
        type: 'battle_start_turn',
      });

      expect(result).toEqual({ mapCleared: false });
      expect(spy).not.toHaveBeenCalled();
    });

    it('returns { mapCleared: false } for a defeat, without reading the world', () => {
      // The last-living-mob layout: a defeat must still never report the map cleared.
      killEntity(DEMON_PATROL_ENTITY_KEY);
      const spy = vi.spyOn(GameState, 'getCampaignState');

      const result = derivePhaseTransitionMetadata(campaignVictoryPhase(), {
        type: 'exit_battle',
        outcome: 'defeat',
      });

      expect(result).toEqual({ mapCleared: false });
      expect(spy).not.toHaveBeenCalled();
    });

    it('returns { mapCleared: false } when the current phase is not a battle', () => {
      const spy = vi.spyOn(GameState, 'getCampaignState');

      const result = derivePhaseTransitionMetadata({ type: 'main_menu' }, VICTORY);

      expect(result).toEqual({ mapCleared: false });
      expect(spy).not.toHaveBeenCalled();
    });

    it('returns { mapCleared: false } for a debug battle without falling back to campaign state', () => {
      killEntity(DEMON_PATROL_ENTITY_KEY);
      const spy = vi.spyOn(GameState, 'getCampaignState');

      // A debug battle carries no map metadata; it must never consult campaign storage.
      const result = derivePhaseTransitionMetadata(
        makeBattlePhase({ sessionSource: 'debug' }),
        VICTORY,
      );

      expect(result).toEqual({ mapCleared: false });
      expect(spy).not.toHaveBeenCalled();
    });

    it('returns { mapCleared: false } for a campaign battle missing mapId or triggerPos', () => {
      const spy = vi.spyOn(GameState, 'getCampaignState');

      expect(
        derivePhaseTransitionMetadata(
          makeBattlePhase({ sessionSource: 'campaign', triggerPos: ORC_PATROL_TRIGGER_POS }),
          VICTORY,
        ),
      ).toEqual({ mapCleared: false });

      expect(
        derivePhaseTransitionMetadata(
          makeBattlePhase({ sessionSource: 'campaign', mapId: FIXTURE_MAP_ID }),
          VICTORY,
        ),
      ).toEqual({ mapCleared: false });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('state lookup and delegation', () => {
    it('returns false while another encounter is still alive', () => {
      const result = derivePhaseTransitionMetadata(campaignVictoryPhase(), VICTORY);

      expect(result).toEqual({ mapCleared: false });
    });

    it('returns true when the triggering encounter is the last living mob', () => {
      killEntity(DEMON_PATROL_ENTITY_KEY);

      const result = derivePhaseTransitionMetadata(campaignVictoryPhase(), VICTORY);

      expect(result).toEqual({ mapCleared: true });
    });

    it('is symmetric — the other encounter clears the map the same way', () => {
      killEntity(ORC_PATROL_ENTITY_KEY);

      const result = derivePhaseTransitionMetadata(
        campaignVictoryPhase(DEMON_PATROL_TRIGGER_POS),
        VICTORY,
      );

      expect(result).toEqual({ mapCleared: true });
    });

    it('returns false for an unknown mapId', () => {
      const result = derivePhaseTransitionMetadata(
        makeBattlePhase({
          sessionSource: 'campaign',
          mapId: 'no_such_map',
          triggerPos: ORC_PATROL_TRIGGER_POS,
        }),
        VICTORY,
      );

      expect(result).toEqual({ mapCleared: false });
    });

    it('returns false when the campaign has no state for that map', () => {
      // Known map definition, but no campaign sub-map record for it.
      const otherMapId = Object.keys(MAP_DEFINITIONS).find(id => id !== FIXTURE_MAP_ID);
      const c = GameState.getCampaignState();
      GameState.setCampaignState({
        ...c,
        world: { ...c.world, subMapStates: {} },
      });

      const result = derivePhaseTransitionMetadata(
        makeBattlePhase({
          sessionSource: 'campaign',
          mapId: otherMapId ?? FIXTURE_MAP_ID,
          triggerPos: ORC_PATROL_TRIGGER_POS,
        }),
        VICTORY,
      );

      expect(result).toEqual({ mapCleared: false });
    });
  });

  it('mutates nothing — campaign, world, sub-map and entity states survive by reference and value', () => {
    killEntity(DEMON_PATROL_ENTITY_KEY);

    const campaign = GameState.getCampaignState();
    const world = campaign.world;
    const subMapStates = world.subMapStates;
    const subMap = subMapStates[FIXTURE_MAP_ID];
    const entityStates = subMap.entityStates;
    const before = structuredClone(entityStates);

    const result = derivePhaseTransitionMetadata(campaignVictoryPhase(), VICTORY);

    expect(result).toEqual({ mapCleared: true });
    expect(GameState.getCampaignState()).toBe(campaign);
    expect(campaign.world).toBe(world);
    expect(world.subMapStates).toBe(subMapStates);
    expect(subMapStates[FIXTURE_MAP_ID]).toBe(subMap);
    expect(subMap.entityStates).toBe(entityStates);
    expect(entityStates).toEqual(before);
  });
});
