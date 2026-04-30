import type { BattleState } from './types';
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
  rng?: () => number;
  queueContext: {
    chargedThisRound: ReadonlySet<string>;
  };
};

/**
 * Computes one turn for the given unit and returns the resulting BattleState.
 * Pure — no Phaser, no animations, no GameState reads. Used by runQuickBattle().
 *
 * `options.rng` controls skill index and target selection.
 * Combat rolls (dodge, block) still use Math.random inside executeSkillUse.
 */
export function computeOneTurn(
  state: BattleState,
  unitId: string,
  options: ComputeOneTurnOptions,
): BattleState {
  const { rng = Math.random, queueContext } = options;
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
  });
  return result.state;
}
