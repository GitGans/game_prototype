import type { BattleState } from './types';
import type { Rng } from '../shared/random';
import {
  getActiveSkill,
  isEnchantmentSkill,
  resolveBestHealTarget,
  resolveRandomSkillIndex,
  resolveRandomTarget,
} from './skillRuntime';
import { resolveSkillTargets } from './targeting';
import { executeSkillUse } from './skillExecution';

export type ComputeOneTurnOptions = {
  rng: Rng;
  queueContext: {
    chargedThisRound: ReadonlySet<string>;
  };
};

/**
 * Computes one turn for the given unit and returns the resulting BattleState.
 * Pure — no Phaser, no animations, no GameState reads. Used by runQuickBattle().
 *
 * `options.rng` controls skill index, target selection, and combat rolls (dodge, block).
 *
 * TODO(post-refactor): consider extracting shared auto/quick skill-target selection.
 * autoTurn in Game.ts performs the same skill/target selection independently.
 */
export function computeOneTurn(
  state: BattleState,
  unitId: string,
  options: ComputeOneTurnOptions,
): BattleState {
  const { rng, queueContext } = options;
  const unit = state.units.get(unitId);
  if (!unit) return state;

  const randomSkillIdx = resolveRandomSkillIndex(unit, rng);
  const updatedUnit = { ...unit, activeSkillIndex: randomSkillIdx };
  const updatedUnits = new Map(state.units);
  updatedUnits.set(unitId, updatedUnit);
  state = { ...state, units: updatedUnits };

  const skill = getActiveSkill(updatedUnit);
  const targets = resolveSkillTargets(updatedUnit, skill, state.occupancy);

  const target = isEnchantmentSkill(skill)
    ? resolveBestHealTarget(state.occupancy, targets)
    : resolveRandomTarget(targets, rng);
  if (!target) return state;

  const result = executeSkillUse({
    state,
    casterId: unitId,
    skill,
    target,
    queueContext,
    rng,
  });
  return result.state;
}
