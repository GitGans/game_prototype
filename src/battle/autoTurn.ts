import type { BattleMode, BattleState, CellCoord } from './types';
import {
  getActiveSkill,
  isEnchantmentSkill,
  resolveBestHealTarget,
  resolveRandomSkillIndex,
  resolveRandomTarget,
} from './skillRuntime';
import { resolveSkillTargets } from './targeting';

export type AutoTurnDecision =
  | { type: 'none';         reason: 'battle_ended' | 'non_auto_mode' }
  | { type: 'handoff_manual' }
  | { type: 'restart_turn' }
  | { type: 'skip_turn';    unitId: string; skillIndex: number; reason: 'blocked_melee' }
  | { type: 'advance_turn'; unitId: string; skillIndex: number }
  | { type: 'use_skill';    unitId: string; skillIndex: number; target: CellCoord };

export function decideAutoTurn(input: {
  state: BattleState;
  mode:  BattleMode;
  rng?:  () => number;
}): AutoTurnDecision {
  const { state, mode } = input;
  const rng = input.rng ?? Math.random;

  if (state.phase === 'end') {
    return { type: 'none', reason: 'battle_ended' };
  }

  const unitId     = state.roundQueue[0];
  const activeUnit = unitId ? state.units.get(unitId) : undefined;
  const isEnemy    = activeUnit?.anchor.side === 'enemy';

  // Mirrors the guard in the old Game.ts.autoTurn() exactly:
  // - enemy units always proceed regardless of mode;
  // - player units in 'manual' mode hand off to manual flow;
  // - player units in any other non-auto mode (transitional) do nothing.
  if (!isEnemy && mode !== 'auto') {
    return mode === 'manual'
      ? { type: 'handoff_manual' }
      : { type: 'none', reason: 'non_auto_mode' };
  }

  if (!activeUnit || !unitId) {
    return { type: 'restart_turn' };
  }

  const skillIndex  = resolveRandomSkillIndex(activeUnit, rng);
  const updatedUnit = { ...activeUnit, activeSkillIndex: skillIndex };
  const skill       = getActiveSkill(updatedUnit);
  const targets     = resolveSkillTargets(updatedUnit, skill, state.occupancy);

  if (targets.length === 0) {
    return skill.actionType === 'melee'
      ? { type: 'skip_turn',    unitId, skillIndex, reason: 'blocked_melee' }
      : { type: 'advance_turn', unitId, skillIndex };
  }

  const target = isEnchantmentSkill(skill)
    ? resolveBestHealTarget(state.occupancy, targets)
    : resolveRandomTarget(targets, rng);

  if (!target) {
    return { type: 'advance_turn', unitId, skillIndex };
  }

  return { type: 'use_skill', unitId, skillIndex, target };
}
