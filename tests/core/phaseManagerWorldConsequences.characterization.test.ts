import { describe, it, expect, afterEach } from 'vitest';
import {
  createLifecycleHarness,
  resetGameStateBetweenTests,
  ORC_PATROL_ENEMY_GROUP_ID,
  ORC_PATROL_TRIGGER_POS,
  ORC_PATROL_ENTITY_KEY,
  DEMON_PATROL_ENEMY_GROUP_ID,
  DEMON_PATROL_TRIGGER_POS,
  DEMON_PATROL_ENTITY_KEY,
  FIXTURE_MAP_ID,
} from './helpers/phaseManagerLifecycleHarness';
import { GameState } from '../../src/core/GameState';
import type { SubMapState } from '../../src/shared/worldTypes';

/**
 * Encounter liveness as production defines it: `entityStates` starts empty and
 * entries are written lazily, so a missing entry means alive. Mirrors the rule
 * in world/mapLogic.ts (`!entityState || entityState.alive !== false`) and
 * world/mapCompletion.ts (`entityStates[key]?.alive !== false`).
 */
function isEncounterAlive(subMap: SubMapState, entityKey: string): boolean {
  const entityState = subMap.entityStates[entityKey];
  return !entityState || entityState.alive !== false;
}

/**
 * Characterizes the persisted world consequences of leaving a battle, and the
 * routing that follows — from metadata derivation through entity state and
 * map-victory.
 *
 * Outcomes are delivered by dispatching `exit_battle` with the authoritative
 * `outcome` directly, never by playing combat out. Stage 2 characterizes what
 * PhaseManager does *after* that lifecycle action; routing through real turns
 * would pull in targeting, damage RNG and balance, and a failure there would
 * masquerade as a world-consequence regression.
 *
 * The pure map-completion rule itself is covered by tests/world/
 * mapCompletion.test.ts and is deliberately not restated here.
 */
describe('PhaseManager world consequences', () => {
  afterEach(resetGameStateBetweenTests);

  // Scenario 1
  it('victory kills only the triggering encounter and replaces world containers immutably', () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();

    const before = GameState.getCampaignState();
    const worldBefore = before.world;
    const subMapBefore = worldBefore.subMapStates[FIXTURE_MAP_ID];
    const entityStatesBefore = subMapBefore.entityStates;

    h.startCampaignBattle(ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS);
    h.manager.transition({ type: 'exit_battle', outcome: 'victory' });

    const after = GameState.getCampaignState();
    const subMapAfter = after.world.subMapStates[FIXTURE_MAP_ID];

    // Only the triggering encounter dies.
    expect(isEncounterAlive(subMapAfter, ORC_PATROL_ENTITY_KEY)).toBe(false);
    expect(isEncounterAlive(subMapAfter, DEMON_PATROL_ENTITY_KEY)).toBe(true);
    // Exactly one entity state was written.
    expect(Object.keys(subMapAfter.entityStates)).toEqual([ORC_PATROL_ENTITY_KEY]);

    // Immutable replacement at every level, not in-place mutation.
    expect(after).not.toBe(before);
    expect(after.world).not.toBe(worldBefore);
    expect(subMapAfter).not.toBe(subMapBefore);
    expect(subMapAfter.entityStates).not.toBe(entityStatesBefore);
    // The pre-battle snapshot must not have been mutated behind our back.
    expect(isEncounterAlive(subMapBefore, ORC_PATROL_ENTITY_KEY)).toBe(true);
    expect(entityStatesBefore).toEqual({});

    expect(GameState.hasBattleRuntime()).toBe(false);
    expect(h.manager.getPhase()).toMatchObject({
      type: 'battle_results',
      mapCleared: false,
    });
  });

  // Scenario 2
  it('defeat leaves the encounter alive and the campaign world untouched, and routes to the world map', () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();
    const worldBefore = GameState.getCampaignState().world;

    h.startCampaignBattle(ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS);
    h.manager.transition({ type: 'exit_battle', outcome: 'defeat' });

    const worldAfter = GameState.getCampaignState().world;
    expect(
      isEncounterAlive(worldAfter.subMapStates[FIXTURE_MAP_ID], ORC_PATROL_ENTITY_KEY),
    ).toBe(true);
    // Identity preserved: a defeat writes no world consequence at all.
    expect(worldAfter).toBe(worldBefore);

    expect(GameState.hasBattleRuntime()).toBe(false);
    expect(h.manager.getPhase().type).toBe('world_map');
  });

  // Scenario 3
  it('a debug victory mutates only debug storage and leaves campaign world and roster intact', () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();

    const campaignBefore = GameState.getCampaignState();
    const worldBefore = campaignBefore.world;
    const rosterBefore = campaignBefore.roster;

    h.openDebugSession(1);
    const debugRosterBefore = GameState.requireDebugState().session.roster;

    h.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
    h.manager.transition({ type: 'exit_battle', outcome: 'victory' });

    // Campaign side untouched by identity.
    const campaignAfter = GameState.getCampaignState();
    expect(campaignAfter.world).toBe(worldBefore);
    expect(campaignAfter.roster).toBe(rosterBefore);

    // No campaign encounter was marked dead.
    const campaignSubMap = campaignAfter.world.subMapStates[FIXTURE_MAP_ID];
    for (const key of [ORC_PATROL_ENTITY_KEY, DEMON_PATROL_ENTITY_KEY]) {
      expect(
        isEncounterAlive(campaignSubMap, key),
        `campaign entity "${key}" should still be alive`,
      ).toBe(true);
    }
    expect(campaignSubMap.entityStates).toEqual({});

    // The debug session absorbed the battle result instead.
    expect(GameState.requireDebugState().session.roster).not.toBe(debugRosterBefore);
    expect(h.manager.getPhase()).toMatchObject({
      type: 'battle_results',
      sessionSource: 'debug',
    });
  });

  // Scenario 4
  it('clearing every encounter reports mapCleared and routes to map_victory', () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();

    h.startCampaignBattle(ORC_PATROL_ENEMY_GROUP_ID, ORC_PATROL_TRIGGER_POS);
    h.manager.transition({ type: 'exit_battle', outcome: 'victory' });
    expect(h.manager.getPhase()).toMatchObject({
      type: 'battle_results',
      mapCleared: false,
    });

    h.manager.transition({ type: 'exit_results' });
    expect(h.manager.getPhase().type).toBe('world_map');

    h.startCampaignBattle(DEMON_PATROL_ENEMY_GROUP_ID, DEMON_PATROL_TRIGGER_POS);
    h.manager.transition({ type: 'exit_battle', outcome: 'victory' });
    expect(h.manager.getPhase()).toMatchObject({
      type: 'battle_results',
      mapCleared: true,
    });

    h.manager.transition({ type: 'exit_results' });
    expect(h.manager.getPhase()).toEqual({
      type: 'map_victory',
      mapId: FIXTURE_MAP_ID,
    });
  });

  // Scenario 5
  it('exit_battle outside a battle is rejected without touching phase, campaign, debug or runtime', () => {
    const h = createLifecycleHarness();
    h.startNewCampaign();

    const phaseBefore = h.manager.getPhase();
    const campaignBefore = GameState.getCampaignState();
    const debugBefore = GameState.getDebugState();
    const syncCallsBefore = h.sync.mock.calls.length;

    h.manager.transition({ type: 'exit_battle', outcome: 'victory' });

    expect(h.manager.getPhase()).toBe(phaseBefore);
    expect(GameState.getCampaignState()).toBe(campaignBefore);
    expect(GameState.getDebugState()).toBe(debugBefore);
    expect(GameState.hasBattleRuntime()).toBe(false);
    expect(h.sync.mock.calls.length).toBe(syncCallsBefore);
  });
});
