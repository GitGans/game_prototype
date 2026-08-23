import { vi, expect } from 'vitest';
import { PhaseManagerClass } from '../../../src/core/PhaseManager';
import { GameState } from '../../../src/core/GameState';
import type { PhaseSceneSynchronizer } from '../../../src/core/phaseSceneSynchronizer';
import type { GamePhase } from '../../../src/core/phases';
import type { WorldPos } from '../../../src/shared/worldTypes';
import type { CellCoord } from '../../../src/shared/gridTypes';
import type { BattleRuntimeContext } from '../../../src/core/battleRuntimeContext';

export const ORC_PATROL_ENEMY_GROUP_ID = 'orc_patrol';
export const ORC_PATROL_TRIGGER_POS: WorldPos = { x: 2, y: 2 };
export const ORC_PATROL_ENTITY_KEY = '2,2';
export const DEMON_PATROL_ENEMY_GROUP_ID = 'demon_patrol';
export const DEMON_PATROL_TRIGGER_POS: WorldPos = { x: 5, y: 6 };
export const DEMON_PATROL_ENTITY_KEY = '5,6';
export const FIXTURE_MAP_ID = 'test_01';

/**
 * Units moved into camp to make a debug party legal.
 *
 * PLAYER_UNITS has 12 entries and MAX_SELECTED_BATTLE_PARTY_SIZE is 9, while
 * `init_debug` builds its session with `initialCampUnitIds: []` — so a fresh
 * debug session has all 12 selected, `canStartBattle: false`, and `start_battle`
 * is rejected by the resolver. Camping three units brings the party to 9.
 *
 * Deliberately the same three ids as CAMPAIGN_INITIAL_STATE_DEFINITION
 * .initialCampUnitIds, so debug and campaign fixtures share a party shape.
 */
export const DEBUG_BATTLE_CAMP_UNIT_IDS = ['healer', 'shaman', 'destroyer'] as const;

/**
 * A unit outside DEBUG_BATTLE_CAMP_UNIT_IDS, for tests that need a camp toggle
 * as a *mutation probe* without disturbing the party-size fixture.
 */
export const DEBUG_MUTATION_PROBE_UNIT_ID = 'soldier';

export interface LifecycleHarness {
  manager: PhaseManagerClass;
  sync: ReturnType<typeof vi.fn>;
  syncedPhases: GamePhase[];
  startNewCampaign(): void;
  openDebugSession(level: number): void;
  startCampaignBattle(enemyGroupId: string, triggerPos: WorldPos): void;
  /** Prepares a legal debug party, then enters the battle. Idempotent. */
  startDebugBattle(enemyGroupId: string): void;
  /** Moves DEBUG_BATTLE_CAMP_UNIT_IDS into camp if not already there. */
  prepareDebugParty(): void;
  /** Drives a live battle to the one verified battleResolution-consuming action. */
  consumeBattleResolutionRng(): void;
}

export function createLifecycleHarness(): LifecycleHarness {
  const syncedPhases: GamePhase[] = [];
  const sync = vi.fn((phase: GamePhase) => {
    syncedPhases.push(phase);
  });
  const fakeSynchronizer: PhaseSceneSynchronizer = { sync };

  const manager = new PhaseManagerClass();
  manager.init(fakeSynchronizer);

  const harness: LifecycleHarness = {
    manager,
    sync,
    syncedPhases,

    startNewCampaign() {
      manager.transition({ type: 'new_game' });
      expect(manager.getPhase().type).toBe('world_map');
    },

    openDebugSession(level: number) {
      // Two-step flow. 'debug' is accepted only from main_menu/world_map, and
      // 'init_debug' only from debug_level_select. Asserting both hops means a
      // rejected setup fails loudly here instead of silently leaving the phase
      // unchanged and poisoning every later assertion in the test.
      manager.transition({ type: 'debug' });
      expect(manager.getPhase().type).toBe('debug_level_select');
      manager.transition({ type: 'init_debug', level });
      expect(manager.getPhase().type).toBe('debug_equip_screen');
    },

    startCampaignBattle(enemyGroupId: string, triggerPos: WorldPos) {
      // 'enter_battle' alone resolves world_map -> battle. Never followed by
      // 'start_battle' — that is the debug-only entry action.
      manager.transition({ type: 'enter_battle', enemyGroupId, triggerPos });
      expect(manager.getPhase().type).toBe('battle');
    },

    prepareDebugParty() {
      // toggle_camp_unit is a *toggle*, so only touch units not already camped:
      // a blind re-toggle would move them back out and re-break the party.
      const phase = manager.getPhase();
      if (phase.type !== 'debug_equip_screen') {
        throw new Error(
          `prepareDebugParty requires debug_equip_screen, got ${phase.type}`,
        );
      }
      for (const templateId of DEBUG_BATTLE_CAMP_UNIT_IDS) {
        const current = manager.getPhase();
        if (current.type !== 'debug_equip_screen') break;
        if (current.campUnitIds.includes(templateId)) continue;
        manager.transition({ type: 'toggle_camp_unit', templateId });
      }
      expect(manager.getPhase()).toMatchObject({
        type: 'debug_equip_screen',
        canStartBattle: true,
      });
    },

    startDebugBattle(enemyGroupId: string) {
      // Establishes ALL prerequisites for a fresh debug battle: a legal party
      // first (see prepareDebugParty), then entry. Safe to call again after
      // reset_debug_session, which restores the empty-camp initialConfig.
      harness.prepareDebugParty();
      manager.transition({ type: 'start_battle', enemyGroupId });
      expect(manager.getPhase().type).toBe('battle');
    },

    consumeBattleResolutionRng() {
      // Verified consuming path: battle_decide_auto_turn -> decideAutoTurn ->
      // chooseSkillIndexForUnit(rng). Requires combat begun (non-empty round
      // queue, live active unit) and auto mode. battle_start_turn does NOT
      // consume battleResolution — resolveActiveTurnStart takes no rng.
      manager.transition({ type: 'battle_begin_combat' });
      manager.transition({ type: 'battle_set_mode', mode: 'auto' });
      manager.transition({ type: 'battle_decide_auto_turn' });
    },
  };

  return harness;
}

export function resetGameStateBetweenTests(): void {
  GameState.resetBattleRuntime();
  GameState.clearDebugState();
}

/**
 * Content-comparable projection of enemy deployment: template id + CellCoord
 * anchor, stably sorted. Reads the canonical replaySetup source, so callers
 * pass GameState.getBattleRuntime() — never a GamePhase.
 */
export function projectEnemyPlacements(
  runtime: BattleRuntimeContext,
): Array<{ templateId: string; anchor: CellCoord }> {
  return [...runtime.replaySetup.enemyPlacements]
    .map(({ templateId, anchor }) => ({ templateId, anchor }))
    .sort((a, b) =>
      a.anchor.side !== b.anchor.side
        ? a.anchor.side.localeCompare(b.anchor.side)
        : a.anchor.row !== b.anchor.row
          ? a.anchor.row - b.anchor.row
          : a.anchor.col !== b.anchor.col
            ? a.anchor.col - b.anchor.col
            : a.templateId.localeCompare(b.templateId),
    );
}
