import type { TurnStartDirective } from '../battle/turnResolver';
import { getActiveSkill } from '../battle/skillRuntime';
import { compileSkillUsePlan } from '../battle/skillPlanCompiler';
import { isAliveFriendlyTargetPolicy } from '../battle/skillUsePlan';
import type { BattleUnitSnapshot } from '../shared/battleSnapshots';
import type {
  BattleDirectivePresentationInput,
  ManualTargetPromptKind,
} from '../shared/battleDirectivePresentationModel';

export function mapDirectiveToPresentationInput(
  directive: TurnStartDirective,
  unitName: string | null,
): BattleDirectivePresentationInput {
  switch (directive.type) {
    case 'schedule_auto_turn':
      return { type: 'schedule_auto_turn', delayKind: directive.delayKind, unitName };

    case 'await_manual_target':
      return { type: 'await_manual_target', promptKind: directive.promptKind, unitName };

    case 'none':
    case 'continue_immediately':
    case 'schedule_next_turn':
      return { type: 'none' };

    default: {
      const _exhaustive: never = directive;
      throw new Error(`Unhandled directive type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function resolveManualTargetPromptKindForUnit(
  unit: BattleUnitSnapshot,
): ManualTargetPromptKind | null {
  const skill = getActiveSkill(unit);
  if (!skill) return null;
  const plan = compileSkillUsePlan(skill);
  return isAliveFriendlyTargetPolicy(plan.targetPolicy) || plan.targetPolicy.type === 'self'
    ? 'heal'
    : 'attack';
}
