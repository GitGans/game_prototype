import { describe, it, expect } from 'vitest';
import {
  createBattleRuntimeForSession,
  createReplayBattleRuntimeForSession,
} from '../../src/core/battleStart';
import type { BattleRuntimeContext } from '../../src/core/battleRuntimeContext';
import type { PlayerSessionState, PlayerSessionSource } from '../../src/core/playerSessionState';
import type { PlayerUnitState } from '../../src/progression';
import { PLAYER_UNITS } from '../../src/data/units';
import { requireFieldDeployment } from '../../src/battle/deployment';
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
function projectPlayerUnits(runtime: BattleRuntimeContext) {
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

function projectEnemyPlacements(runtime: BattleRuntimeContext) {
  return [...runtime.state.units.values()]
    .filter(u => u.side === 'enemy')
    .map(u => ({
      templateId: u.templateId,
      level:      u.level,
      anchor:     requireFieldDeployment(runtime.state, u.id).anchor,
    }));
}

const ROSTER = {
  [ALICE.templateId]: unitState(),
  [BOB.templateId]:   unitState({ lifeState: 'dead', currentHp: 0 }),
  [CARA.templateId]:  unitState({ currentHp: 5 }),
};

function startRuntime(sessionSource: PlayerSessionSource = 'campaign') {
  return createBattleRuntimeForSession({
    session: makeSession(ROSTER), sessionSource,
    enemyGroupId: 'orc_patrol', rng: fixedRng(0),
  });
}

/** Mirrors PhaseManager's call site: only replaySetup and sessionSource cross the boundary. */
function replayFrom(previous: BattleRuntimeContext, session: PlayerSessionState) {
  return createReplayBattleRuntimeForSession({
    session,
    replaySetup:   previous.replaySetup,
    sessionSource: previous.sessionSource,
  });
}

describe('createBattleRuntimeForSession', () => {
  it('builds a runtime carrying the requested session source', () => {
    const runtime = createBattleRuntimeForSession({
      session: makeSession(ROSTER),
      sessionSource: 'campaign',
      enemyGroupId: 'orc_patrol',
      rng: fixedRng(0),
    });

    expect(runtime.sessionSource).toBe('campaign');
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

describe('createReplayBattleRuntimeForSession', () => {
  it('restores the captured enemy formation without consuming RNG', () => {
    const previous = startRuntime();
    const replayed = replayFrom(previous, makeSession(ROSTER));

    expect(projectEnemyPlacements(replayed)).toEqual(projectEnemyPlacements(previous));
    expect(replayed.replaySetup.enemyPlacements)
      .toEqual(previous.replaySetup.enemyPlacements);
    expect(replayed.replaySetup).not.toBe(previous.replaySetup);
  });

  it('re-projects player units from the supplied current session', () => {
    // The current session has changed since the previous attempt was started.
    const levelled = makeSession({ ...ROSTER, [ALICE.templateId]: unitState({ level: 4 }) });
    const replayed = replayFrom(startRuntime(), levelled);

    const alice = projectPlayerUnits(replayed).find(u => u.templateId === ALICE.templateId)!;
    expect(alice.level).toBe(4);
    expect(replayed.participants.find(p => p.templateId === ALICE.templateId)!.level).toBe(4);
  });

  // Stage 7 bug fix. Reusing the previous participants is now unrepresentable by signature,
  // so this pins the positive contract: participants describe THIS attempt's deployment.
  it("builds participants that agree with the replay attempt's own deployments", () => {
    const replayed = replayFrom(startRuntime(), makeSession(ROSTER));

    for (const p of replayed.participants) {
      const unit = [...replayed.state.units.values()]
        .find(u => u.side === 'player' && u.templateId === p.templateId)!;
      expect(p.wasOnBench)
        .toBe(replayed.state.deployments.get(unit.id)!.kind === 'bench');
      expect(p.isAlive).toBe(unit.lifeState === 'alive');
    }
    expect(replayed.participants.map(p => p.templateId))
      .toEqual([ALICE.templateId, BOB.templateId, CARA.templateId]);
  });

  it('starts a fresh attempt: placement phase, manual mode, no pending intention', () => {
    const previous = startRuntime();
    const replayed = replayFrom(previous, makeSession(ROSTER));

    expect(replayed.state.phase).toBe('placement');
    expect(replayed.mode).toBe('manual');
    expect(replayed.pendingAutoTurnIntention).toBeNull();
    expect(replayed.turnContext).not.toBe(previous.turnContext);
  });

  it('throws before building a runtime when the current party cannot start a battle', () => {
    const allDead = makeSession({
      [ALICE.templateId]: unitState({ lifeState: 'dead', currentHp: 0 }),
    });

    expect(() => replayFrom(startRuntime(), allDead)).toThrow(/invalid party/);
  });

  it('produces identical replays for equivalent campaign and debug inputs', () => {
    const campaign = replayFrom(startRuntime('campaign'), makeSession(ROSTER));
    const debug    = replayFrom(startRuntime('debug'),    makeSession(ROSTER));

    expect(projectPlayerUnits(debug)).toEqual(projectPlayerUnits(campaign));
    expect(projectEnemyPlacements(debug)).toEqual(projectEnemyPlacements(campaign));
    expect(debug.participants).toEqual(campaign.participants);

    // The only permitted difference.
    expect(campaign.sessionSource).toBe('campaign');
    expect(debug.sessionSource).toBe('debug');
  });
});
