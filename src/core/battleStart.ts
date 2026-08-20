import type { Rng }                        from '../shared/random';
import { getRosterPartyStatus }            from '../progression';
import { projectPlayerBattleSetup }        from './battleSetupProjection';
import {
  buildNewBattleState,
  buildReplayBattleState,
}                                          from './battleInitialization';
import { buildInitialBattleParticipants }  from './battleParticipants';
import {
  createBattleRuntimeContext,
  createEmptyBattleState,
  type BattleReplaySetup,
  type BattleRuntimeContext,
} from './battleRuntimeContext';
import type { PlayerSessionSource, PlayerSessionState } from './playerSessionState';

/**
 * Both battle-attempt factories require a session whose current roster can start a
 * battle (at least one living selected unit, at most MAX_SELECTED_BATTLE_PARTY_SIZE
 * selected). `resolveTransition()` must already have rejected the action, so reaching
 * either factory with an invalid party is a lifecycle error, not a user-facing case.
 */
function assertPartyCanStartBattle(session: PlayerSessionState, caller: string): void {
  if (!getRosterPartyStatus(session.roster).canStartBattle) {
    throw new Error(
      `${caller}: invalid party — resolveTransition must reject the action before side effects run`,
    );
  }
}

export interface CreateBattleRuntimeForSessionInput {
  session:       PlayerSessionState;
  sessionSource: PlayerSessionSource;
  enemyGroupId:  string;
  rng:           Rng;
}

/**
 * The single campaign/debug battle-start pipeline. Pure composition: it builds a
 * runtime and returns it — it never installs one and never touches `GameState`.
 *
 * Campaign map metadata (mapId, triggerPos, returnPhase) stays on the phase and
 * is deliberately not an input here.
 */
export function createBattleRuntimeForSession(
  input: CreateBattleRuntimeForSessionInput,
): BattleRuntimeContext {
  assertPartyCanStartBattle(input.session, 'createBattleRuntimeForSession');

  const setup = projectPlayerBattleSetup(input.session);
  const { state, enemyPlacements, playerPlacements } = buildNewBattleState(
    createEmptyBattleState(), setup, input.enemyGroupId, input.rng,
  );

  return createBattleRuntimeContext({
    state,
    participants:  buildInitialBattleParticipants(state, playerPlacements),
    replaySetup:   { enemyPlacements },
    sessionSource: input.sessionSource,
  });
}

export interface CreateReplayBattleRuntimeForSessionInput {
  session:       PlayerSessionState;
  replaySetup:   BattleReplaySetup;
  sessionSource: PlayerSessionSource;
}

/**
 * The single campaign/debug replay pipeline. Restores the captured enemy formation and
 * re-projects player units from the CURRENT session, then builds participants from this
 * attempt's own placement records.
 *
 * The previous attempt's runtime is deliberately NOT an input: only the captured
 * `replaySetup` and the `sessionSource` survive an attempt boundary, so its participants,
 * state, mode and turn context are out of scope by construction. Reusing a previous
 * participant snapshot was the Stage 7 bug — after Stage 6, persisted `lastPlacement` can
 * change the field/bench split between attempts, and `wasOnBench` feeds exit persistence.
 *
 * Pure composition: it returns a runtime, never installs one, never reads storage and
 * never consumes RNG. It does not branch on `sessionSource` — that value is carried
 * through to the new runtime unchanged.
 */
export function createReplayBattleRuntimeForSession(
  input: CreateReplayBattleRuntimeForSessionInput,
): BattleRuntimeContext {
  assertPartyCanStartBattle(input.session, 'createReplayBattleRuntimeForSession');

  const setup = projectPlayerBattleSetup(input.session);
  const { state, playerPlacements } = buildReplayBattleState(
    createEmptyBattleState(), setup, input.replaySetup.enemyPlacements,
  );

  return createBattleRuntimeContext({
    state,
    participants:  buildInitialBattleParticipants(state, playerPlacements),
    replaySetup:   input.replaySetup,
    sessionSource: input.sessionSource,
  });
}
