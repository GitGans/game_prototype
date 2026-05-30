import type {
  ActionSkillDefinition,
  SkillDefinitionAction,
} from '../shared/skillDefinitionTypes';
import type { SkillUseAction, SkillUsePlan } from './skillUsePlan';
import { STAT_EFFECTS, PERIODIC_HP_EFFECTS } from '../data/skills';
import { resolveStatEffect } from './skillEffectCompiler';

// Compile-time parity guard on action discriminants.
// Authoring and runtime action payloads intentionally differ (e.g. apply_stat_effect
// gains a resolvedEffect at compile time), so we compare type tags only — not full
// object unions. Adding a new action variant on one side without the other will
// fail this check at build time.
type SkillDefinitionActionType = SkillDefinitionAction['type'];
type SkillUseActionType = SkillUseAction['type'];

type _RuntimeActionTypesMatchAuthoring =
  SkillUseActionType extends SkillDefinitionActionType ? true : false;
type _AuthoringActionTypesMatchRuntime =
  SkillDefinitionActionType extends SkillUseActionType ? true : false;

const _runtimeActionTypesMatchAuthoring: _RuntimeActionTypesMatchAuthoring = true;
const _authoringActionTypesMatchRuntime: _AuthoringActionTypesMatchRuntime = true;

void _runtimeActionTypesMatchAuthoring;
void _authoringActionTypesMatchRuntime;

// Authoring-correctness gate: revive action requires dead_friendly target policy.
// The two fields are independent in ActionSkillDefinition, so the type system
// can't express this rule; the runtime throw is the enforcement boundary.
function validateActionSkillDefinition(def: ActionSkillDefinition): void {
  const hasRevive = def.actions.some((action) => action.type === 'revive');
  if (hasRevive && def.targetPolicy.type !== 'dead_friendly') {
    throw new Error(
      `Skill "${def.id}" uses revive action but targetPolicy is "${def.targetPolicy.type}". ` +
      `Revive skills must use targetPolicy "dead_friendly".`,
    );
  }
}

function compileAction(action: SkillDefinitionAction): SkillUseAction {
  switch (action.type) {
    case 'damage':
      return {
        type: 'damage',
        powerSource: action.powerSource,
        matrix: action.matrix,
        modifiers: action.modifiers?.map((m) => ({
          type: m.modifierType,
          level: m.level,
        })),
      };

    case 'heal':
      return {
        type: 'heal',
        powerSource: action.powerSource,
        matrix: action.matrix,
      };

    case 'apply_stat_effect': {
      const def = STAT_EFFECTS[action.effectName];
      if (!def) {
        throw new Error(`Unknown stat effect: ${action.effectName}`);
      }
      return {
        type: 'apply_stat_effect',
        effect: {
          effectName: action.effectName,
          displayName: action.displayName,
          level: action.level,
          duration: action.duration,
        },
        matrix: action.matrix,
        resolvedEffect: resolveStatEffect(action.effectName, action.level),
      };
    }

    case 'apply_periodic_hp_effect': {
      const def = PERIODIC_HP_EFFECTS[action.effectName];
      if (!def) {
        throw new Error(`Unknown periodic HP effect: ${action.effectName}`);
      }
      return {
        type: 'apply_periodic_hp_effect',
        effect: {
          effectName: action.effectName,
          displayName: action.displayName,
          level: action.level,
          duration: action.duration,
        },
        displayEffect: {
          id: action.effectName,
          effectTone: def.direction === 'buff' ? 'positive' : 'negative',
          description: def.description,
        },
        direction: action.direction,
        powerSource: action.powerSource,
        matrix: action.matrix,
      };
    }

    case 'post_damage':
      return {
        type: 'post_damage',
        postDamage: {
          type: action.postDamageType,
          level: action.level,
        },
      };

    case 'probability_effect':
      return {
        type: 'probability_effect',
        probabilityEffect: {
          type: action.probabilityEffectType,
          displayName: action.displayName,
        },
        matrix: action.matrix,
      };

    case 'revive':
      return {
        type: 'revive',
        revive: { level: action.level },
        matrix: action.matrix,
      };

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function compileActionSkillDefinition(
  def: ActionSkillDefinition,
): SkillUsePlan {
  validateActionSkillDefinition(def);

  return {
    skillId: def.id,
    name: def.name,
    targetPolicy: def.targetPolicy,
    actions: def.actions.map(compileAction),
  };
}
