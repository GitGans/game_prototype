import type {
  ActionSkillDefinition,
  SkillDefinitionAction,
} from '../shared/skillDefinitionTypes';
import type { SkillUseAction, SkillUsePlan } from './skillUsePlan';
import { STAT_EFFECTS, PERIODIC_HP_EFFECTS } from '../data/skills';
import { resolveStatEffect } from './skillEffectCompiler';

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

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function compileActionSkillDefinition(
  def: ActionSkillDefinition,
): SkillUsePlan {
  return {
    skillId: def.id,
    name: def.name,
    targetPolicy: def.targetPolicy,
    actions: def.actions.map(compileAction),
  };
}
