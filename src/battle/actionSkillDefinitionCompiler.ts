import type {
  ActionSkillDefinition,
  SkillDefinitionAction,
} from '../shared/skillDefinitionTypes';
import type { SkillUseAction, SkillUsePlan } from './skillUsePlan';
import { LEVELED_EFFECTS } from '../data/skillDefinitions';
import { resolveLeveledStatEffect } from './skillEffectCompiler';

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
      const def = LEVELED_EFFECTS[action.effectName];
      if (!def) {
        throw new Error(`Unknown leveled effect: ${action.effectName}`);
      }
      if (def.effectKind !== 'stat_modifier') {
        throw new Error(
          `apply_stat_effect cannot use periodic HP effect "${action.effectName}". ` +
            `Use apply_periodic_hp_effect instead.`,
        );
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
        resolvedEffect: resolveLeveledStatEffect(action.effectName, action.level),
      };
    }

    case 'apply_periodic_hp_effect': {
      const def = LEVELED_EFFECTS[action.effectName];
      if (!def) {
        throw new Error(`Unknown leveled effect: ${action.effectName}`);
      }
      if (def.effectKind !== 'periodic_hp') {
        throw new Error(
          `apply_periodic_hp_effect cannot use stat modifier effect "${action.effectName}". ` +
            `Use apply_stat_effect instead.`,
        );
      }
      return {
        type: 'apply_periodic_hp_effect',
        effect: {
          effectName: action.effectName,
          displayName: action.displayName,
          level: action.level,
          duration: action.duration,
        },
        displayEffect: def.effect,
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

    case 'instant_effect':
      return {
        type: 'instant_effect',
        instantEffect: {
          type: action.instantEffectType,
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
