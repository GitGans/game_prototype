import type { Rng }                        from '../shared/random';
import { getRosterPartyStatus }            from '../progression';
import { projectPlayerBattleSetup }        from './battleSetupProjection';
import { buildNewBattleState }             from './battleInitialization';
import { buildInitialBattleParticipants }  from './battleParticipants';
import {
  createBattleRuntimeContext,
  createEmptyBattleState,
  type BattleRuntimeContext,
} from './battleRuntimeContext';
import type { PlayerSessionSource, PlayerSessionState } from './playerSessionState';

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
  const status = getRosterPartyStatus(input.session.roster);
  if (!status.canStartBattle) {
    throw new Error(
      'createBattleRuntimeForSession: invalid party — resolveTransition must reject ' +
      'enter_battle/start_battle before side effects run',
    );
  }

  const setup = projectPlayerBattleSetup(input.session);
  const { state, enemyPlacements, playerPlacements } = buildNewBattleState(
    createEmptyBattleState(), setup, input.enemyGroupId, input.rng,
  );

  return createBattleRuntimeContext({
    state,
    participants:  buildInitialBattleParticipants(state, playerPlacements),
    replaySetup:   { enemyGroupId: input.enemyGroupId, enemyPlacements },
    sessionSource: input.sessionSource,
  });
}
