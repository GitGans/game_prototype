import type { RosterState } from '../progression';
import type { BattleResultParticipantSeed, BattleResultUnit } from './phases';

/**
 * Result-screen read model. The final stored roster of the session that fought the
 * battle is the single source of truth for level and life state; the seeds carry only
 * immutable presentation metadata that no longer exists once the runtime is cleared.
 */
export function buildBattleResultsSnapshot(
  roster: RosterState,
  seeds: readonly BattleResultParticipantSeed[],
): BattleResultUnit[] {
  return seeds.map(seed => {
    const unitState = roster.units[seed.templateId];
    if (!unitState) {
      throw new Error(`buildBattleResultsSnapshot: no roster record for "${seed.templateId}"`);
    }
    return {
      templateId: seed.templateId,
      name:       seed.name,
      spriteKey:  seed.spriteKey,
      wasOnBench: seed.wasOnBench,
      newLevel:   unitState.level,
      isAlive:    unitState.lifeState === 'alive',
    };
  });
}
