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

// Quick battle has no charge lifecycle until the turn resolver owns it.
// TODO Stage 4: move charge context into the turn resolver.
const EMPTY_CHARGED_THIS_ROUND: ReadonlySet<string> = new Set<string>();

/**
 * Computes one turn for the given unit and returns the resulting BattleState.
 * Pure — no Phaser, no animations, no GameState reads. Used by runQuickBattle().
 *
 * `rng` controls skill index and target selection.
 * Combat rolls (dodge, block) still use Math.random inside executeSkillUse.
 * TODO Stage 4/5: thread deterministic combat RNG through the executor if
 * replayable quick battle is needed.
 */
export function computeOneTurn(
  state: BattleState,
  unitId: string,
  rng: () => number = Math.random,
): BattleState {
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
    queueContext: { chargedThisRound: EMPTY_CHARGED_THIS_ROUND },
  });
  return result.state;
}
