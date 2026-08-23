import { beforeEach, describe, expect, it } from 'vitest';
import { rebuildPhaseSnapshot } from '../../src/core/phaseSnapshotRebuilder';
import { GameState } from '../../src/core/GameState';
import { initCampaignState } from '../../src/core/initCampaignState';
import { initializeDebugSession, clearDebugSession } from '../../src/core/debugLifecycle';
import { createBattleRuntimeContext } from '../../src/core/battleRuntimeContext';
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from '../../src/data/campaignInitialStateDefinition';
import { MAP_DEFINITIONS } from '../../src/data/mapDefinitions';
import { PLAYER_UNITS } from '../../src/data/units';
import { ITEM_CATALOG } from '../../src/data/itemDefinitions';
import { CAMPAIGN_STARTING_ITEMS } from '../../src/data/startingInventoryDefinitions';
import { EMPTY_BACKPACK_SNAPSHOT, EMPTY_EQUIP_SNAPSHOT } from '../../src/core/phases';
import type { GamePhase } from '../../src/core/phases';
import { makeBattleStateFromUnits } from '../battle/helpers/battleState';
import { makeUnit, resetUnitIdCounter } from '../battle/helpers/units';
import { makeBattlePhase, makeWorldMapPhase } from './helpers/phaseFixtures';
import { FIXTURE_MAP_ID } from './helpers/phaseManagerLifecycleHarness';

// ── Observably different sessions ────────────────────────────────────────────
// Campaign: every unit level 1, camp = healer/shaman/destroyer.
// Debug:    every unit level DEBUG_LEVEL, camp = soldier only.
// A rebuild that reads the wrong storage tree therefore cannot produce a passing
// result by accident — level and camp membership both disagree.
const DEBUG_LEVEL = 7;
const DEBUG_CAMP_UNIT_IDS = ['soldier'];
const CAMPAIGN_CAMP_UNIT_IDS = [...CAMPAIGN_INITIAL_STATE_DEFINITION.initialCampUnitIds];
const PROBE_UNIT_ID = 'soldier';

function installCampaign(): void {
  GameState.setCampaignState(
    initCampaignState({
      playerUnits: PLAYER_UNITS,
      itemCatalog: ITEM_CATALOG,
      startingItems: CAMPAIGN_STARTING_ITEMS,
      mapDefinitions: MAP_DEFINITIONS,
      initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
    }),
  );
}

function installDebugSession(): void {
  initializeDebugSession({
    level: DEBUG_LEVEL,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    initialCampUnitIds: DEBUG_CAMP_UNIT_IDS,
  });
}

// Camp membership does not affect upgrade-tier unlocking, so the probe unit is reused here.
const UPGRADE_UNIT_ID = 'soldier';

function equipScreenPhase(): Extract<GamePhase, { type: 'equip_screen' }> {
  return {
    type: 'equip_screen',
    sessionSource: 'campaign',
    selectedUnitTemplateId: PROBE_UNIT_ID,
    selectedUnitSpriteKey: null,
    selectedUnit: null,
    returnPhase: makeWorldMapPhase(),
    backpack: EMPTY_BACKPACK_SNAPSHOT,
    unitEquipment: EMPTY_EQUIP_SNAPSHOT,
    availableUnits: [],
    unitStats: null,
    learnedSkills: [],
    upgradeSkills: [],
  };
}

function debugEquipScreenPhase(): Extract<GamePhase, { type: 'debug_equip_screen' }> {
  return {
    type: 'debug_equip_screen',
    sessionSource: 'debug',
    selectedUnitTemplateId: PROBE_UNIT_ID,
    selectedUnitSpriteKey: null,
    selectedUnit: null,
    availableUnits: [],
    backpack: EMPTY_BACKPACK_SNAPSHOT,
    unitEquipment: EMPTY_EQUIP_SNAPSHOT,
    unitStats: null,
    campUnitIds: [],
    selectedForBattleUnitCount: 0,
    activeLivingUnitCount: 0,
    canStartBattle: false,
    learnedSkills: [],
    upgradeSkills: [],
  };
}

describe('rebuildPhaseSnapshot', () => {
  beforeEach(() => {
    resetUnitIdCounter();
    if (GameState.hasBattleRuntime()) GameState.resetBattleRuntime();
    clearDebugSession();
    installCampaign();
    installDebugSession();
  });

  describe('snapshotless phases', () => {
    it.each<[string, GamePhase]>([
      ['main_menu', { type: 'main_menu' }],
      ['debug_level_select', { type: 'debug_level_select' }],
      ['map_victory', { type: 'map_victory', mapId: FIXTURE_MAP_ID }],
    ])('returns %s by identity', (_label, phase) => {
      expect(rebuildPhaseSnapshot(phase)).toBe(phase);
    });
  });

  describe('world_map', () => {
    it('ignores stale placeholder fields and rebuilds from authoritative campaign state', () => {
      const stale = makeWorldMapPhase({
        mapId: 'stale',
        partyPos: { x: 99, y: 99 },
        mapState: { entityStates: {} },
        canStartBattle: false,
        activeLivingUnitCount: 0,
      });

      const result = rebuildPhaseSnapshot(stale);

      expect(result.type).toBe('world_map');
      if (result.type !== 'world_map') throw new Error('unreachable');
      const campaign = GameState.getCampaignState();
      expect(result.mapId).toBe(campaign.world.currentMapId);
      expect(result.mapId).not.toBe('stale');
      expect(result.partyPos).toEqual(campaign.world.partyPos);
      expect(result.canStartBattle).toBe(true);
      expect(result.activeLivingUnitCount).toBeGreaterThan(0);
    });
  });

  describe('session-scoped phases read exactly the tree named by sessionSource', () => {
    it('equip_screen reads the campaign session', () => {
      const result = rebuildPhaseSnapshot(equipScreenPhase());

      if (result.type !== 'equip_screen') throw new Error('unreachable');
      expect(result.unitStats?.level).toBe(1);
      expect(result.unitStats?.level).not.toBe(DEBUG_LEVEL);
      expect(result.selectedUnit).not.toBeNull();
    });

    it('debug_equip_screen reads the debug session and combines equipment + camp projections', () => {
      const result = rebuildPhaseSnapshot(debugEquipScreenPhase());

      if (result.type !== 'debug_equip_screen') throw new Error('unreachable');
      // Equipment half — debug levels, not campaign levels.
      expect(result.unitStats?.level).toBe(DEBUG_LEVEL);
      expect(result.selectedUnit).not.toBeNull();
      // Camp half — debug camp membership, not campaign camp membership.
      expect(result.campUnitIds).toEqual(DEBUG_CAMP_UNIT_IDS);
      expect(result.campUnitIds).not.toEqual(CAMPAIGN_CAMP_UNIT_IDS);
      expect(result.selectedForBattleUnitCount).toBe(
        PLAYER_UNITS.length - DEBUG_CAMP_UNIT_IDS.length,
      );
      expect(result.activeLivingUnitCount).toBeGreaterThan(0);
    });

    it('camp rebuilds campaign roster presentation and party-validity fields', () => {
      const phase: GamePhase = {
        type: 'camp',
        sessionSource: 'campaign',
        returnPhase: makeWorldMapPhase(),
        units: [],
        selectedForBattleUnitCount: 0,
        activeLivingUnitCount: 0,
        canStartBattle: false,
      };

      const result = rebuildPhaseSnapshot(phase);

      if (result.type !== 'camp') throw new Error('unreachable');
      expect(result.units).toHaveLength(PLAYER_UNITS.length);
      expect(result.units.filter(u => u.inCamp).map(u => u.templateId).sort())
        .toEqual([...CAMPAIGN_CAMP_UNIT_IDS].sort());
      expect(result.selectedForBattleUnitCount).toBe(
        PLAYER_UNITS.length - CAMPAIGN_CAMP_UNIT_IDS.length,
      );
      expect(result.canStartBattle).toBe(true);
    });

    it('upgrade_tree uses the phase\'s explicit sessionSource', () => {
      function upgradeTreePhase(sessionSource: 'campaign' | 'debug'): GamePhase {
        return {
          type: 'upgrade_tree',
          sessionSource,
          unitTemplateId: UPGRADE_UNIT_ID,
          unitName: '',
          returnPhase: makeWorldMapPhase(),
          upgradeTiers: [],
        };
      }

      const campaignResult = rebuildPhaseSnapshot(upgradeTreePhase('campaign'));
      const debugResult = rebuildPhaseSnapshot(upgradeTreePhase('debug'));

      if (campaignResult.type !== 'upgrade_tree' || debugResult.type !== 'upgrade_tree') {
        throw new Error('unreachable');
      }
      expect(campaignResult.unitName).not.toBe('');
      expect(debugResult.unitName).toBe(campaignResult.unitName);

      // Tier 5 is locked at campaign level 1 and unlocked at debug level 7.
      const campaignTier5 = campaignResult.upgradeTiers.find(t => t.tierId === 5);
      const debugTier5 = debugResult.upgradeTiers.find(t => t.tierId === 5);
      expect(campaignTier5?.isLocked).toBe(true);
      expect(debugTier5?.isLocked).toBe(false);
    });

    it('battle_results uses the roster named by sessionSource and never needs battle runtime', () => {
      function resultsPhase(sessionSource: 'campaign' | 'debug'): GamePhase {
        return {
          type: 'battle_results',
          sessionSource,
          participantSeeds: [
            { templateId: PROBE_UNIT_ID, name: 'Probe', wasOnBench: false, spriteKey: null },
          ],
          units: [],
          returnPhase: makeWorldMapPhase(),
          mapCleared: false,
        };
      }

      // Runtime is already cleared by the time this snapshot is built.
      expect(GameState.hasBattleRuntime()).toBe(false);

      const campaignResult = rebuildPhaseSnapshot(resultsPhase('campaign'));
      const debugResult = rebuildPhaseSnapshot(resultsPhase('debug'));

      if (campaignResult.type !== 'battle_results' || debugResult.type !== 'battle_results') {
        throw new Error('unreachable');
      }
      expect(campaignResult.units).toEqual([
        {
          templateId: PROBE_UNIT_ID,
          name: 'Probe',
          spriteKey: null,
          wasOnBench: false,
          newLevel: 1,
          isAlive: true,
        },
      ]);
      expect(debugResult.units[0].newLevel).toBe(DEBUG_LEVEL);
    });
  });

  describe('battle', () => {
    function installRuntime(sessionSource: 'campaign' | 'debug'): void {
      const state = makeBattleStateFromUnits({
        field: [
          {
            unit: makeUnit({ id: 'p1', side: 'player' }),
            anchor: { side: 'player', row: 0, col: 0 },
          },
        ],
      });
      GameState.setBattleRuntime(
        createBattleRuntimeContext({
          state,
          participants: [],
          replaySetup: { enemyPlacements: [] },
          sessionSource,
        }),
      );
    }

    it('rebuilds from the active runtime', () => {
      installRuntime('campaign');

      const result = rebuildPhaseSnapshot(makeBattlePhase({ sessionSource: 'campaign' }));

      if (result.type !== 'battle') throw new Error('unreachable');
      expect(result.activeUnitId).toBe('p1');
      expect(result.fieldUnits.map(u => u.id)).toEqual(['p1']);
      expect(result.unitsById.get('p1')).toBe(result.activeUnit);
    });

    it('throws on a runtime/phase sessionSource mismatch instead of falling back', () => {
      installRuntime('debug');

      expect(() =>
        rebuildPhaseSnapshot(makeBattlePhase({ sessionSource: 'campaign' })),
      ).toThrow(/sessionSource mismatch/);
    });
  });
});
