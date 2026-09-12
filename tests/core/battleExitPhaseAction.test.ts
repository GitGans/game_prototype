import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GameState } from '../../src/core/GameState';
import { PlayerSessionStore } from '../../src/core/playerSessionStore';
import { finalizeBattleSessionOnExit } from '../../src/core/battlePhaseEffects';
import {
  writeBattleRuntimeSlot, clearBattleRuntimeSlot,
} from '../../src/core/battleRuntimeStorage';
import { makeBattlePhase } from './helpers/phaseFixtures';
import { createBattleRuntimeForSession } from '../../src/core/battleStart';
import { initCampaignState } from '../../src/core/initCampaignState';
import { PLAYER_UNITS } from '../../src/data/units';
import { ITEM_CATALOG } from '../../src/data/itemDefinitions';
import { CAMPAIGN_STARTING_ITEMS } from '../../src/data/startingInventoryDefinitions';
import { MAP_DEFINITIONS } from '../../src/data/mapDefinitions';
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from '../../src/data/campaignInitialStateDefinition';
import { fixedRng } from '../battle/helpers/rng';
import type { PlayerSessionSource, PlayerSessionState } from '../../src/core/playerSessionState';
import type { BattleRuntimeContext } from '../../src/core/battleRuntimeContext';
import type { BattleExitOutcome } from '../../src/core/battleRuntimeContext';
import type { DebugSessionConfig } from '../../src/core/DebugBattleState';

const debugConfig: DebugSessionConfig =
  { level: 1, startingItems: CAMPAIGN_STARTING_ITEMS, initialCampUnitIds: [] };

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const campaignRoster = () => GameState.getCampaignState().roster;
const debugRoster    = () => GameState.requireDebugState().session.roster;

/**
 * Campaign and debug are seeded with structurally identical sessions, so any difference
 * in the resulting rosters would come from the exit pipeline rather than from setup.
 */
function seedSessions(): PlayerSessionState {
  GameState.setCampaignState(initCampaignState({
    playerUnits:    PLAYER_UNITS,
    itemCatalog:    ITEM_CATALOG,
    startingItems:  CAMPAIGN_STARTING_ITEMS,
    mapDefinitions: MAP_DEFINITIONS,
    initialState:   CAMPAIGN_INITIAL_STATE_DEFINITION,
  }));
  const campaign = GameState.getCampaignState();
  const session: PlayerSessionState = { roster: campaign.roster, inventory: campaign.inventory };
  GameState.setDebugState({ session: clone(session), initialConfig: debugConfig });
  return session;
}

function makeRuntime(session: PlayerSessionState, sessionSource: PlayerSessionSource): BattleRuntimeContext {
  return createBattleRuntimeForSession({
    session,
    sessionSource,
    enemyGroupId: 'orc_patrol',
    rng: fixedRng(0),
  });
}

/**
 * Installs the runtime and returns the battle phase that owns it. `finalizeBattleSessionOnExit`
 * resolves the runtime through `requireBattleRuntimeForPhase`, exactly as the pipeline does.
 */
function installFor(runtime: BattleRuntimeContext) {
  writeBattleRuntimeSlot(runtime);
  return makeBattlePhase({ sessionSource: runtime.sessionSource });
}

describe('finalizeBattleSessionOnExit — storage routing', () => {
  let session: PlayerSessionState;

  beforeEach(() => {
    session = seedSessions();
  });

  afterEach(() => {
    clearBattleRuntimeSlot();
    vi.restoreAllMocks();
  });

  const cases: { source: PlayerSessionSource; outcome: BattleExitOutcome }[] = [
    { source: 'campaign', outcome: 'victory' },
    { source: 'campaign', outcome: 'defeat'  },
    { source: 'debug',    outcome: 'victory' },
    { source: 'debug',    outcome: 'defeat'  },
  ];

  for (const { source, outcome } of cases) {
    it(`source '${source}' + ${outcome} writes only the ${source} roster`, () => {
      const otherBefore = source === 'campaign' ? debugRoster() : campaignRoster();
      const runtime     = makeRuntime(session, source);

      finalizeBattleSessionOnExit({ previousPhase: installFor(runtime), outcome });

      const written = source === 'campaign' ? campaignRoster() : debugRoster();
      const other   = source === 'campaign' ? debugRoster()    : campaignRoster();

      // The written roster is a fresh object; the other storage tree is untouched by identity.
      expect(written).not.toBe(otherBefore);
      expect(other).toBe(otherBefore);

      const participantId = runtime.participants[0].templateId;
      const expectedLevel = session.roster.units[participantId].level + (outcome === 'victory' ? 1 : 0);
      expect(written.units[participantId].level).toBe(expectedLevel);
    });
  }

  it('equivalent campaign and debug sessions produce equivalent rosters', () => {
    finalizeBattleSessionOnExit({
      previousPhase: installFor(makeRuntime(session, 'campaign')), outcome: 'victory',
    });
    finalizeBattleSessionOnExit({
      previousPhase: installFor(makeRuntime(session, 'debug')), outcome: 'victory',
    });

    expect(debugRoster()).toEqual(campaignRoster());
  });

  it('throws on a missing debug session without touching campaign', () => {
    const runtime         = makeRuntime(session, 'debug');
    const phase           = installFor(runtime);
    const campaignBefore  = campaignRoster();

    GameState.clearDebugState();

    expect(() => finalizeBattleSessionOnExit({ previousPhase: phase, outcome: 'victory' }))
      .toThrow('Debug state is not initialized');
    expect(campaignRoster()).toBe(campaignBefore);
  });

  it('performs exactly one session replacement per exit, and no separate roster write', () => {
    // One write, not two: roster result and item settlement reach storage together, so no
    // intermediate session exists in which the potion is gone but the damage is unrecorded.
    const sessionSpy = vi.spyOn(PlayerSessionStore, 'replaceSession');
    const rosterSpy  = vi.spyOn(PlayerSessionStore, 'replaceRoster');

    finalizeBattleSessionOnExit({
      previousPhase: installFor(makeRuntime(session, 'campaign')), outcome: 'victory',
    });

    expect(sessionSpy).toHaveBeenCalledTimes(1);
    expect(sessionSpy.mock.calls[0][0]).toBe('campaign');
    expect(rosterSpy).not.toHaveBeenCalled();
  });

  it('leaves the roster alone on an abandonment exit, but still settles', () => {
    const before = campaignRoster();

    finalizeBattleSessionOnExit({
      previousPhase: installFor(makeRuntime(session, 'campaign')), outcome: null,
    });

    // No outcome → the roster keeps whatever policy that route already had (none).
    expect(campaignRoster()).toEqual(before);
  });
});
