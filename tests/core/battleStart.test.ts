import { describe, it, expect } from 'vitest';
import { createBattleRuntimeForSession } from '../../src/core/battleStart';
import type { PlayerSessionState } from '../../src/core/playerSessionState';
import type { PlayerUnitState } from '../../src/progression';
import { PLAYER_UNITS } from '../../src/data/units';
import { fixedRng } from '../battle/helpers/rng';

const [ALICE, BOB, CARA] = PLAYER_UNITS;

function unitState(overrides: Partial<PlayerUnitState> = {}): PlayerUnitState {
  return {
    level: 1,
    isInCamp: false,
    lastPlacement: null,
    permanentBonuses: {},
    chosenUpgrades: {},
    lifeState: 'alive',
    currentHp: null,
    ...overrides,
  };
}

function makeSession(units: Record<string, PlayerUnitState>): PlayerSessionState {
  return { roster: { units }, inventory: { instances: {}, containers: {} } };
}

/**
 * Stable semantic projection of a runtime — never the runtime object itself,
 * which holds Maps and unit-factory closures.
 */
function projectPlayerUnits(runtime: ReturnType<typeof createBattleRuntimeForSession>) {
  return [...runtime.state.units.values()]
    .filter(u => u.side === 'player')
    .map(u => ({
      templateId: u.templateId,
      level:      u.level,
      lifeState:  u.lifeState,
      hp:         u.hp,
      maxHp:      u.maxHp,
      deployment: runtime.state.deployments.get(u.id)!.kind,
    }));
}

const ROSTER = {
  [ALICE.templateId]: unitState(),
  [BOB.templateId]:   unitState({ lifeState: 'dead', currentHp: 0 }),
  [CARA.templateId]:  unitState({ currentHp: 5 }),
};

describe('createBattleRuntimeForSession', () => {
  it('builds a runtime carrying the requested session source', () => {
    const runtime = createBattleRuntimeForSession({
      session: makeSession(ROSTER),
      sessionSource: 'campaign',
      enemyGroupId: 'orc_patrol',
      rng: fixedRng(0),
    });

    expect(runtime.sessionSource).toBe('campaign');
    expect(runtime.replaySetup.enemyGroupId).toBe('orc_patrol');
    expect(runtime.state.phase).toBe('placement');
  });

  it('includes a persistent-dead unit as a dead runtime unit and a participant', () => {
    const runtime = createBattleRuntimeForSession({
      session: makeSession(ROSTER),
      sessionSource: 'campaign',
      enemyGroupId: 'orc_patrol',
      rng: fixedRng(0),
    });

    const dead = projectPlayerUnits(runtime).find(u => u.templateId === BOB.templateId)!;
    expect(dead.lifeState).toBe('dead');
    expect(dead.hp).toBe(0);
    expect(dead.maxHp).toBeGreaterThan(0);

    const participant = runtime.participants.find(p => p.templateId === BOB.templateId)!;
    expect(participant.isAlive).toBe(false);
  });

  it('participant order follows setup order, not living-first creation order', () => {
    const runtime = createBattleRuntimeForSession({
      session: makeSession(ROSTER),
      sessionSource: 'campaign',
      enemyGroupId: 'orc_patrol',
      rng: fixedRng(0),
    });

    expect(runtime.participants.map(p => p.templateId))
      .toEqual([ALICE.templateId, BOB.templateId, CARA.templateId]);
  });

  it('equivalent campaign and debug sessions produce equivalent player runtimes', () => {
    const campaign = createBattleRuntimeForSession({
      session: makeSession(ROSTER),
      sessionSource: 'campaign',
      enemyGroupId: 'orc_patrol',
      rng: fixedRng(0),
    });
    const debug = createBattleRuntimeForSession({
      session: makeSession(ROSTER),
      sessionSource: 'debug',
      enemyGroupId: 'orc_patrol',
      rng: fixedRng(0),
    });

    expect(projectPlayerUnits(debug)).toEqual(projectPlayerUnits(campaign));
    expect(debug.participants).toEqual(campaign.participants);

    // The runtimes differ only in their session source.
    expect(campaign.sessionSource).toBe('campaign');
    expect(debug.sessionSource).toBe('debug');
  });

  it('throws for an invalid party — resolveTransition must reject it first', () => {
    const allDead = makeSession({
      [ALICE.templateId]: unitState({ lifeState: 'dead', currentHp: 0 }),
    });
    expect(() => createBattleRuntimeForSession({
      session: allDead,
      sessionSource: 'campaign',
      enemyGroupId: 'orc_patrol',
      rng: fixedRng(0),
    })).toThrow(/invalid party/);
  });

  it('throws when the selected party exceeds deployment capacity', () => {
    const units: Record<string, PlayerUnitState> = {};
    for (const bp of PLAYER_UNITS.slice(0, 10)) units[bp.templateId] = unitState();
    expect(() => createBattleRuntimeForSession({
      session: makeSession(units),
      sessionSource: 'campaign',
      enemyGroupId: 'orc_patrol',
      rng: fixedRng(0),
    })).toThrow(/invalid party/);
  });
});
