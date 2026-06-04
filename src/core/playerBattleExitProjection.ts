import type { BattleState, Unit } from '../battle/types';
import { isAlive } from '../battle/lifeState';
import type { CellCoord } from '../shared/gridTypes';
import type {
  PlayerExitInput,
  PlayerRuntimeSnapshot,
} from './playerUnitPersistence';

// Structural participant input. `BattleParticipant` from `./phases` satisfies this
// shape; keeping the type local avoids importing the heavier snapshot interface here.
export interface ExitParticipant {
  templateId: string;
  wasOnBench: boolean;
}

/**
 * Battle → campaign projection seam. Turns runtime `BattleState` + the battle's
 * participant list into the `PlayerExitInput[]` that `applyBattleExitPlayerPersistence`
 * consumes.
 *
 * Invariants enforced here:
 *  - runtime.lifeState is sourced from `isAlive(unit)`, NOT from `state.units.has(id)`,
 *    because dead units stay in `state.units`.
 *  - `lastFieldPlacement` is a fresh value object, never a reference into
 *    `BattleState.deployments` — campaign state must not retain runtime aliases.
 *  - duplicate runtime player units per templateId throw, matching the campaign
 *    roster invariant.
 */
export function buildPlayerExitInputs(
  participants: readonly ExitParticipant[],
  state: BattleState,
): PlayerExitInput[] {
  const runtimePlayerByTemplateId = new Map<string, Unit>();
  for (const u of state.units.values()) {
    if (u.side !== 'player') continue;
    if (runtimePlayerByTemplateId.has(u.templateId)) {
      throw new Error(
        `buildPlayerExitInputs: duplicate runtime player unit for templateId="${u.templateId}". ` +
        `Campaign roster invariant violated.`,
      );
    }
    runtimePlayerByTemplateId.set(u.templateId, u);
  }

  return participants.map(p => {
    const runtimeUnit = runtimePlayerByTemplateId.get(p.templateId);

    let runtime: PlayerRuntimeSnapshot | undefined;
    if (runtimeUnit) {
      runtime = {
        hp: runtimeUnit.hp,
        maxHp: runtimeUnit.maxHp,
        lifeState: isAlive(runtimeUnit) ? 'alive' : 'dead',
      };
    }

    let lastFieldPlacement: CellCoord | null = null;
    if (runtimeUnit) {
      const dep = state.deployments.get(runtimeUnit.id);
      // Clone the anchor — campaign state must not retain a reference to a
      // runtime BattleState object.
      if (dep?.kind === 'field') lastFieldPlacement = { ...dep.anchor };
    }

    return {
      templateId: p.templateId,
      wasOnBench: p.wasOnBench,
      runtime,
      lastFieldPlacement,
    };
  });
}
