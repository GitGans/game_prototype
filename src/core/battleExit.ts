import { PLAYER_UNITS } from '../data/units';
import type { UnitBlueprint } from '../shared/unitTypes';
import type { RosterState, PlayerUnitState } from '../progression';
import type { BattleRuntimeContext, BattleExitOutcome } from './battleRuntimeContext';
import type { PlayerSessionState } from './playerSessionState';
import { resolvePlayerMaxHpForLevel } from './battleSetupProjection';
import { buildPlayerExitInputs } from './playerBattleExitProjection';
import {
  applyFieldPlacementsToRoster,
  applyBattleExitPlayerPersistence,
  applyVictoryLevelUpPersistence,
  type PlayerLevelUpInput,
} from './playerUnitPersistence';

/**
 * Deliberately narrower than `BattleRuntimeContext`: `sessionSource`, mode, replay
 * metadata, turn context and pending intentions are unreachable inside the pure
 * result rules by type, not by convention.
 */
export type BattleExitRuntimeInput = Pick<BattleRuntimeContext, 'state' | 'participants'>;

/**
 * The single source-neutral battle-result rule: runtime + session + outcome → next roster.
 * Storage selection happens above this function and is invisible to it, so equivalent
 * campaign and debug sessions receive equivalent roster changes.
 *
 * The whole next roster is computed before the caller writes anything, so a lifecycle
 * error leaves roster, runtime and phase untouched.
 */
export function applyBattleResult(
  input: {
    runtime: BattleExitRuntimeInput;
    session: PlayerSessionState;
    outcome: BattleExitOutcome;
  },
  playerBlueprints: readonly UnitBlueprint[] = PLAYER_UNITS,
): RosterState {
  const { runtime, session, outcome } = input;

  const exits = buildPlayerExitInputs(runtime.participants, runtime.state);

  const rosterAfterPlacement = applyFieldPlacementsToRoster(session.roster, runtime.state);
  const unitsAfterBattle     = applyBattleExitPlayerPersistence(rosterAfterPlacement.units, exits);

  if (outcome === 'defeat') return { units: unitsAfterBattle };

  // Victory levels every participant exactly once — field, bench, dead and revived alike.
  // Inputs are read from the POST-battle roster: reading `session.roster` here would
  // silently revert battle damage, death and revive.
  const levelUps: PlayerLevelUpInput[] = runtime.participants.map(participant => {
    const persisted: PlayerUnitState | undefined = unitsAfterBattle[participant.templateId];
    if (!persisted) {
      throw new Error(`applyBattleResult: no roster record for "${participant.templateId}"`);
    }
    const blueprint = playerBlueprints.find(bp => bp.templateId === participant.templateId);
    if (!blueprint) {
      throw new Error(`applyBattleResult: no player blueprint for "${participant.templateId}"`);
    }

    const newLevel = persisted.level + 1;
    return {
      templateId: participant.templateId,
      newLevel,
      newMaxHp: resolvePlayerMaxHpForLevel({
        blueprint,
        level:            newLevel,
        chosenUpgrades:   persisted.chosenUpgrades ?? {},
        permanentBonuses: persisted.permanentBonuses ?? {},
        itemContainers:   session.inventory.containers,
        itemInstances:    session.inventory.instances,
      }),
    };
  });

  return { units: applyVictoryLevelUpPersistence(unitsAfterBattle, levelUps) };
}
