import type { BattleTurnDirectiveFeedback } from './battleActionFeedback';
import { getActiveSkill } from '../battle/skillRuntime';
import { compileSkillUsePlan } from '../battle/skillPlanCompiler';
import type { BattleUnitSnapshot } from '../shared/battleSnapshots';
import type {
  BattleDirectivePresentationInput,
  ManualTargetPromptKind,
} from '../shared/battleDirectivePresentationModel';

export function mapDirectiveToPresentationInput(
  directive: BattleTurnDirectiveFeedback,
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
  const policy = plan.targetPolicy;
  switch (policy.type) {
    case 'enemy_melee':
    case 'enemy_ranged':
      return 'attack';
    case 'alive_friendly':
    case 'self':
      return 'heal';
    case 'dead_friendly':
      return 'revive';
    default: {
      const _exhaustive: never = policy;
      return _exhaustive;
    }
  }
}
