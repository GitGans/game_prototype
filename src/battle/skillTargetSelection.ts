import type { BattleState, CellCoord, Unit } from './types';
import type { Rng } from '../shared/random';
import type { SkillUsePlan } from './skillUsePlan';

import { pickOneOrNull } from '../shared/random';
import { compileSkillUsePlan } from './skillPlanCompiler';
import {
  getActiveSkill,
  resolveBestHealTarget,
  resolveRandomSkillIndex,
} from './skillRuntime';
import { requireFieldDeployment } from './deployment';
import { resolveSkillTargetsForPolicy } from './targeting';

export function chooseSkillTargetForPlan(input: {
  state: BattleState;
  plan: SkillUsePlan;
  targets: readonly CellCoord[];
  rng: Rng;
}): CellCoord | null {
  const { state, plan, targets, rng } = input;
  if (targets.length === 0) return null;

  const policy = plan.targetPolicy;
  switch (policy.type) {
    case 'enemy_melee':
    case 'enemy_ranged':
      return pickOneOrNull(rng, targets);
    case 'alive_friendly':
    case 'self':
      return resolveBestHealTarget(state, [...targets]);
    case 'dead_friendly':
      return pickOneOrNull(rng, targets);
    default: {
      const _exhaustive: never = policy;
      return _exhaustive;
    }
  }
}

export function chooseSkillIndexForUnit(input: {
  state: BattleState;
  unit: Unit;
  rng: Rng;
}): number {
  const { state, unit, rng } = input;
  const unitAnchor = requireFieldDeployment(state, unit.id).anchor;

  // RNG-FREE filtering: probe every skill, collect indexes with valid targets.
  const candidates: number[] = [];
  for (let i = 0; i < unit.skills.length; i++) {
    const probedUnit = { ...unit, activeSkillIndex: i };
    const skill = getActiveSkill(probedUnit);
    const plan = compileSkillUsePlan(skill);
    const targets = resolveSkillTargetsForPolicy(plan.targetPolicy, state, unitAnchor);
    if (targets.length > 0) candidates.push(i);
  }

  if (candidates.length > 0) {
    return pickOneOrNull(rng, candidates)!;
  }

  return resolveRandomSkillIndex(unit, rng);
}
