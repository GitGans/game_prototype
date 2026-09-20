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
import { equipItem } from '../../src/inventory';
import { resolveUnitProgression } from '../../src/progression';
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

const POTION = 'item_start_small_healing_potion';
const CARRIER = 'warrior';

/**
 * Equips the starting potion on the carrier in the CAMPAIGN session, then installs a campaign
 * runtime whose attempt has drunk it — a record settlement accepts, so a test that sees the
 * potion survive is observing the abandonment rule, not a rejected record.
 */
function installCampaignAttemptThatDrankThePotion() {
  const campaign  = GameState.getCampaignState();
  const blueprint = PLAYER_UNITS.find(u => u.templateId === CARRIER)!;
  const classId   = resolveUnitProgression(
    blueprint, campaign.roster.units[CARRIER].chosenUpgrades,
  ).currentClassId;
  const equipped = equipItem(CARRIER, classId, POTION, campaign.inventory, ITEM_CATALOG);
  if (!equipped.ok) throw new Error(`fixture: could not equip the potion (${equipped.reason})`);
  GameState.replaceCampaignInventory(equipped.nextInventory);

  const runtime = makeRuntime(PlayerSessionStore.getSession('campaign'), 'campaign');
  return installFor({
    ...runtime,
    consumedItems: [
      { instanceId: POTION, definitionId: 'small_healing_potion', unitTemplateId: CARRIER },
    ],
  });
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

  for (const outcome of ['victory', 'defeat'] as const) {
    it(`performs exactly one session replacement for a ${outcome} exit, and no separate roster write`, () => {
      // One write per completed exit, not two: roster result and item settlement reach storage
      // together, so no intermediate session exists in which the potion is gone but the damage
      // is unrecorded.
      const sessionSpy = vi.spyOn(PlayerSessionStore, 'replaceSession');
      const rosterSpy  = vi.spyOn(PlayerSessionStore, 'replaceRoster');

      finalizeBattleSessionOnExit({
        previousPhase: installFor(makeRuntime(session, 'campaign')), outcome,
      });

      expect(sessionSpy).toHaveBeenCalledTimes(1);
      expect(sessionSpy.mock.calls[0][0]).toBe('campaign');
      expect(rosterSpy).not.toHaveBeenCalled();
    });
  }

  it('commits a completed attempt\'s consumption: defeat removes the drunk potion', () => {
    // Positive control for the fixture: the same record IS settled when there is an outcome.
    const sessionSpy = vi.spyOn(PlayerSessionStore, 'replaceSession');

    finalizeBattleSessionOnExit({
      previousPhase: installCampaignAttemptThatDrankThePotion(), outcome: 'defeat',
    });

    expect(sessionSpy).toHaveBeenCalledTimes(1);
    expect(GameState.getCampaignState().inventory.instances[POTION]).toBeUndefined();
  });

  it('writes nothing for an abandoned attempt: roster and inventory keep their identity', () => {
    const phase           = installCampaignAttemptThatDrankThePotion();
    const rosterBefore    = campaignRoster();
    const inventoryBefore = GameState.getCampaignState().inventory;
    const debugBefore     = GameState.requireDebugState().session;
    const sessionSpy      = vi.spyOn(PlayerSessionStore, 'replaceSession');
    const rosterSpy       = vi.spyOn(PlayerSessionStore, 'replaceRoster');
    const inventorySpy    = vi.spyOn(PlayerSessionStore, 'replaceInventory');

    finalizeBattleSessionOnExit({ previousPhase: phase, outcome: null });

    expect(sessionSpy).not.toHaveBeenCalled();
    expect(rosterSpy).not.toHaveBeenCalled();
    expect(inventorySpy).not.toHaveBeenCalled();
    expect(campaignRoster()).toBe(rosterBefore);
    expect(GameState.getCampaignState().inventory).toBe(inventoryBefore);
    expect(GameState.getCampaignState().inventory.containers[`equip_${CARRIER}`]?.slots.usable_slot)
      .toBe(POTION);
    expect(GameState.requireDebugState().session).toBe(debugBefore);
  });

  it('still validates the runtime source on an abandoned exit', () => {
    // Invariant 1: the early return must come AFTER requireBattleRuntimeForPhase.
    writeBattleRuntimeSlot(makeRuntime(session, 'debug'));
    const campaignPhase  = makeBattlePhase({ sessionSource: 'campaign' });
    const campaignBefore = GameState.getCampaignState();

    expect(() => finalizeBattleSessionOnExit({ previousPhase: campaignPhase, outcome: null }))
      .toThrow('Battle runtime/phase sessionSource mismatch');
    expect(GameState.getCampaignState()).toBe(campaignBefore);
  });

  it('still resolves the owning session on an abandoned exit: a missing debug session throws', () => {
    // Invariant 2, separate from the one above: phase and runtime AGREE on 'debug', so
    // requireBattleRuntimeForPhase passes — only the owning-session lookup can catch this.
    const phase          = installFor(makeRuntime(session, 'debug'));
    const campaignBefore = GameState.getCampaignState();
    GameState.clearDebugState();

    expect(() => finalizeBattleSessionOnExit({ previousPhase: phase, outcome: null }))
      .toThrow('Debug state is not initialized');
    expect(GameState.getCampaignState()).toBe(campaignBefore);
  });
});
