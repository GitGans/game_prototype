import type { BattleTurnDirectiveFeedback } from './battleActionFeedback';
import type { GamePhase } from './phases';
import { getActiveSkill } from '../battle/skillRuntime';
import { compileSkillUsePlan } from '../battle/skillPlanCompiler';
import type { BattleUnitSnapshot } from '../shared/battleSnapshots';
import type {
  BattleDirectivePresentationInput,
  ManualTargetPromptKind,
} from '../shared/battleDirectivePresentationModel';

type BattlePhase = Extract<GamePhase, { type: 'battle' }>;

export function mapDirectiveToPresentationInput(
  directive: BattleTurnDirectiveFeedback,
  unitName: string | null,
): BattleDirectivePresentationInput {
  switch (directive.type) {
    case 'schedule_auto_turn':
      return { type: 'schedule_auto_turn', delayKind: directive.delayKind, unitName };

    case 'await_manual_target':
      return { type: 'await_manual_target', promptKind: directive.promptKind, unitName };

    case 'await_manual_action':
      return { type: 'await_manual_action', unitName };

    case 'none':
    case 'continue_immediately':
      return { type: 'none' };

    default: {
      const _exhaustive: never = directive;
      throw new Error(`Unhandled directive type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/**
 * Presentation for the CURRENT manual selection, derived only from committed render data.
 *
 * Used at both manual entry points — turn start and skill switch — so the same situation is always
 * worded the same way. It resolves no targets, evaluates no items and reads no runtime: an empty
 * committed `validTargets` IS "the selected skill has no targets", and manual player control is the
 * committed `manualTurnControlsVisible` flag (owned by `battlePhaseSnapshot`), never re-derived here.
 */
export function buildManualTurnPresentationInput(
  phase: BattlePhase,
): BattleDirectivePresentationInput {
  const unit = phase.activeUnit;
  if (!phase.manualTurnControlsVisible || phase.battlePhase !== 'select_target' || !unit) {
    return { type: 'none' };
  }

  if (phase.validTargets.length === 0) {
    return { type: 'await_manual_action', unitName: unit.name };
  }

  const promptKind = resolveManualTargetPromptKindForUnit(unit);
  if (!promptKind) return { type: 'none' };
  return { type: 'await_manual_target', promptKind, unitName: unit.name };
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
