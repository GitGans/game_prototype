import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameState } from '../../src/core/GameState';
import {
  clearBattleRuntimeSlot,
  writeBattleRuntimeSlot,
} from '../../src/core/battleRuntimeStorage';
import {
  applyMovePartyPhaseAction,
  applyBattleWorldConsequence,
} from '../../src/core/phaseHandlers/worldPhaseHandler';
import {
  createBattleRuntimeContext,
  createEmptyBattleState,
} from '../../src/core/battleRuntimeContext';
import type { PlayerSessionSource } from '../../src/core/playerSessionState';
import { initializeNewCampaign } from '../../src/core/campaignLifecycle';
import { makeBattlePhase } from './helpers/phaseFixtures';
import { FIXTURE_MAP_ID } from './helpers/phaseManagerLifecycleHarness';

/**
 * The world-mutation seam. It owns no rules — the transformations live in
 * `campaignWorldTransitions.ts` — so what is worth pinning here is the *guarding*: which
 * (outcome, session source, phase metadata) combinations reach storage at all, and that a
 * runtime/phase mismatch is caught before any campaign write.
 *
 * The end-to-end world-consequence contract stays owned by
 * `phaseManagerWorldConsequences.characterization.test.ts`.
 */

function installRuntime(sessionSource: PlayerSessionSource): void {
  writeBattleRuntimeSlot(createBattleRuntimeContext({
    state: createEmptyBattleState(),
    participants: [],
    replaySetup: { enemyPlacements: [] },
    sessionSource,
  }));
}

/** A campaign battle phase carrying the map metadata a world consequence needs. */
function campaignBattlePhase(mapId: string | undefined = FIXTURE_MAP_ID) {
  return makeBattlePhase({
    sessionSource: 'campaign',
    mapId,
    triggerPos: { x: 2, y: 2 },
  });
}

describe('worldPhaseHandler', () => {
  beforeEach(() => {
    clearBattleRuntimeSlot();
    GameState.clearDebugState();
    initializeNewCampaign();
  });

  afterEach(() => {
    clearBattleRuntimeSlot();
    GameState.clearDebugState();
  });

  describe('applyMovePartyPhaseAction', () => {
    it('installs the new party position', () => {
      applyMovePartyPhaseAction({ type: 'move_party', partyPos: { x: 4, y: 9 } });

      expect(GameState.getCampaignState().world.partyPos).toEqual({ x: 4, y: 9 });
    });

    it('does not let campaign state alias the caller-owned action coordinate', () => {
      // `partyPos` arrives on a PhaseAction — a public API boundary. A scene reusing a scratch
      // coordinate object would otherwise be able to move the party after the fact.
      const partyPos = { x: 1, y: 1 };
      applyMovePartyPhaseAction({ type: 'move_party', partyPos });

      partyPos.x = 77;

      expect(GameState.getCampaignState().world.partyPos).toEqual({ x: 1, y: 1 });
    });
  });

  describe('applyBattleWorldConsequence', () => {
    it('marks the defeated encounter dead on a campaign victory', () => {
      installRuntime('campaign');
      const mapId = GameState.getCampaignState().world.currentMapId;

      applyBattleWorldConsequence({
        previousPhase: campaignBattlePhase(mapId),
        outcome: 'victory',
      });

      expect(GameState.getCampaignState().world.subMapStates[mapId].entityStates['2,2'])
        .toEqual({ alive: false });
    });

    it('leaves the encounter intact on defeat, so it can be retried', () => {
      installRuntime('campaign');
      const before = GameState.getCampaignState();

      applyBattleWorldConsequence({
        previousPhase: campaignBattlePhase(before.world.currentMapId),
        outcome: 'defeat',
      });

      expect(GameState.getCampaignState()).toBe(before);
    });

    it('never writes campaign state for a debug victory', () => {
      // Debug sessions are isolated from campaign progress: winning a debug battle must not
      // clear an encounter on the campaign map.
      installRuntime('debug');
      const before = GameState.getCampaignState();

      applyBattleWorldConsequence({
        previousPhase: makeBattlePhase({
          sessionSource: 'debug',
          mapId: before.world.currentMapId,
          triggerPos: { x: 2, y: 2 },
        }),
        outcome: 'victory',
      });

      expect(GameState.getCampaignState()).toBe(before);
    });

    it.each([
      ['mapId', makeBattlePhase({ sessionSource: 'campaign', mapId: undefined, triggerPos: { x: 2, y: 2 } })],
      ['triggerPos', makeBattlePhase({ sessionSource: 'campaign', mapId: FIXTURE_MAP_ID, triggerPos: undefined })],
    ])('is a no-op when the battle phase carries no %s', (_label, previousPhase) => {
      installRuntime('campaign');
      const before = GameState.getCampaignState();

      applyBattleWorldConsequence({ previousPhase, outcome: 'victory' });

      expect(GameState.getCampaignState()).toBe(before);
    });

    it('is a no-op when the campaign has no state for the phase map', () => {
      installRuntime('campaign');
      const before = GameState.getCampaignState();

      applyBattleWorldConsequence({
        previousPhase: campaignBattlePhase('no_such_map'),
        outcome: 'victory',
      });

      expect(GameState.getCampaignState()).toBe(before);
    });

    it('validates the runtime itself and throws before mutating on a source mismatch', () => {
      // This owner must not depend on `applyBattleExitRosterEffect` having validated first:
      // it is exported independently, and a mismatch reaching campaign storage would write a
      // debug battle's outcome onto campaign progress.
      installRuntime('debug');
      const before = GameState.getCampaignState();

      expect(() => applyBattleWorldConsequence({
        previousPhase: campaignBattlePhase(before.world.currentMapId),
        outcome: 'victory',
      })).toThrow();

      expect(GameState.getCampaignState()).toBe(before);
    });

    it('throws on a corrupted runtime even for a defeat exit', () => {
      // The runtime is resolved before the outcome guard, matching the pre-extraction code
      // which resolved it unconditionally for every exit_battle.
      installRuntime('debug');

      expect(() => applyBattleWorldConsequence({
        previousPhase: campaignBattlePhase(),
        outcome: 'defeat',
      })).toThrow();
    });

    it('throws when no battle runtime is installed at all', () => {
      clearBattleRuntimeSlot();

      expect(() => applyBattleWorldConsequence({
        previousPhase: campaignBattlePhase(),
        outcome: 'victory',
      })).toThrow();
    });
  });
});
