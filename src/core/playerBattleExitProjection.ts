import type { BattleState, Unit } from '../battle/types';
import { isAlive } from '../battle/lifeState';
import type { PlayerExitInput } from './playerUnitPersistence';

/**
 * Structural participant input. `BattleParticipant` satisfies this shape; the local
 * type keeps this module free of the heavier runtime contract.
 */
export interface ExitParticipant {
  templateId: string;
}

/**
 * Battle runtime → persistence projection, source-neutral by construction.
 *
 * Enforces the lifecycle invariant that battle participants and runtime player units
 * correspond one-to-one. Player participants are persistent roster entities: death
 * changes life state, it never removes the unit from `BattleState.units`, and there are
 * no player-side battle-only summons. Any deviation is state corruption, not a case to
 * absorb.
 *
 * Placement is NOT projected here — `applyFieldPlacementsToRoster` owns the single
 * placement rule for both confirmed combat and battle exit.
 */
export function buildPlayerExitInputs(
  participants: readonly ExitParticipant[],
  state: BattleState,
): PlayerExitInput[] {
  const runtimeByTemplateId = new Map<string, Unit>();
  for (const unit of state.units.values()) {
    if (unit.side !== 'player') continue;               // enemies are outside this correspondence
    if (runtimeByTemplateId.has(unit.templateId)) {
      throw new Error(
        `buildPlayerExitInputs: duplicate runtime player unit for templateId "${unit.templateId}"`,
      );
    }
    runtimeByTemplateId.set(unit.templateId, unit);
  }

  const seen = new Set<string>();
  const inputs = participants.map(participant => {
    if (seen.has(participant.templateId)) {
      throw new Error(
        `buildPlayerExitInputs: duplicate participant templateId "${participant.templateId}"`,
      );
    }
    seen.add(participant.templateId);

    const unit = runtimeByTemplateId.get(participant.templateId);
    if (!unit) {
      throw new Error(
        `buildPlayerExitInputs: participant "${participant.templateId}" has no runtime player unit`,
      );
    }
    if (!state.deployments.has(unit.id)) {
      throw new Error(
        `buildPlayerExitInputs: participant "${participant.templateId}" has no field or bench deployment`,
      );
    }

    return {
      templateId: participant.templateId,
      runtime: {
        hp:        unit.hp,
        maxHp:     unit.maxHp,
        // Sourced from isAlive(unit), never from state.units.has(id) — dead units stay in the map.
        lifeState: isAlive(unit) ? 'alive' as const : 'dead' as const,
      },
    };
  });

  if (runtimeByTemplateId.size !== inputs.length) {
    const orphan = [...runtimeByTemplateId.keys()].find(id => !seen.has(id));
    throw new Error(
      `buildPlayerExitInputs: runtime player unit "${orphan}" has no battle participant`,
    );
  }

  return inputs;
}
