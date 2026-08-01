import type { BattleState }            from '../battle/types';
import type { PlayerInitialPlacement } from '../battle/autoPlace';
import { isAlive }                     from '../battle/lifeState';
import { getUnitSpriteTextureKey }     from './unitSpriteKey';
import type { BattleParticipant }      from './battleRuntimeContext';

/**
 * Battle-start participant snapshot, shared by campaign and debug.
 *
 * The placement records ARE the initial-deployment truth — current
 * `state.deployments` is never consulted, so `wasOnBench` stays correct
 * regardless of when this runs relative to placement actions. Any mismatch
 * between a record and the runtime unit is an internal invariant violation
 * and throws.
 *
 * Reads only `BattleState` + records: no roster, inventory, campaign/debug
 * storage, `GameState`, phases, or rendering.
 */
export function buildInitialBattleParticipants(
  state: BattleState,
  placements: readonly PlayerInitialPlacement[],
): BattleParticipant[] {
  const seenUnitIds = new Set<string>();

  return placements.map(p => {
    const unit = state.units.get(p.unitId);
    if (!unit) {
      throw new Error(`buildInitialBattleParticipants: no runtime unit for id "${p.unitId}"`);
    }
    if (unit.side !== 'player') {
      throw new Error(`buildInitialBattleParticipants: unit "${p.unitId}" is not a player unit`);
    }
    if (unit.templateId !== p.templateId) {
      throw new Error(
        `buildInitialBattleParticipants: unit "${p.unitId}" has templateId "${unit.templateId}", ` +
        `placement record says "${p.templateId}"`,
      );
    }
    if (seenUnitIds.has(p.unitId)) {
      throw new Error(`buildInitialBattleParticipants: duplicate placement record for unit "${p.unitId}"`);
    }
    seenUnitIds.add(p.unitId);

    return {
      templateId: unit.templateId,
      name:       unit.name,
      level:      unit.level,
      isAlive:    isAlive(unit),
      wasOnBench: p.deployment.kind === 'bench',
      spriteKey:  unit.spriteSheet
        ? getUnitSpriteTextureKey(unit.templateId, unit.spriteSheet)
        : null,
    };
  });
}
