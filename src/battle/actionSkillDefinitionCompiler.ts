import type {
  ActionSkillDefinition,
  SkillDefinitionAction,
} from '../shared/skillDefinitionTypes';
import type { SkillUseAction, SkillUsePlan } from './skillUsePlan';
import { LEVELED_EFFECTS } from '../data/skillDefinitions';
import { resolveLeveledStatEffect } from './skillEffectCompiler';

const STAT_BONUS_FIELDS = [
  'physicalDefenseBonus',
  'magicalDefenseBonus',
  'dodgeBonus',
  'blockBonus',
  'initiativeBonus',
  'physicalDamageBonus',
  'magicalDamageBonus',
] as const;

function compileAction(action: SkillDefinitionAction): SkillUseAction {
  switch (action.type) {
    case 'damage':
      return {
        type: 'damage',
        powerSource: action.powerSource,
        powerMode: 'effective',
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
        powerMode: 'raw',
        matrix: action.matrix,
      };

    case 'apply_stat_effect': {
      const def = LEVELED_EFFECTS[action.effectName];
      if (!def) {
        throw new Error(`Unknown leveled effect: ${action.effectName}`);
      }
      // Reject periodic HP effects used in a stat-effect action.
      // effectDamageType marks a periodic HP scaling source in the legacy registry.
      // Using such an effect here would silently produce a stat-effect action with
      // no periodic HP semantics, making the new authoring format ambiguous.
      if (def.effectDamageType !== undefined) {
        throw new Error(
          `apply_stat_effect cannot use periodic HP effect "${action.effectName}". ` +
            `Use apply_periodic_hp_effect instead.`,
        );
      }
      return {
        type: 'apply_stat_effect',
        effectBlock: {
          effectMatrixName: action.matrix.matrixName,
          level: action.level,
          effectDisplayName: action.displayName,
          effectName: action.effectName,
          duration: action.duration,
          // damageType is a compatibility placeholder for the legacy SkillEffectBlock shape.
          // Stat effects do not scale from caster power; this field is not read at runtime.
          damageType: 'physical',
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
      // Reject stat-bonus effects used in a periodic HP action.
      // An effect with stat bonus fields is a stat effect; placing it here would cause
      // applyEffectBlock to store those bonuses while also applying periodic HP,
      // which makes behavior unpredictable.
      const hasStatBonuses = STAT_BONUS_FIELDS.some(
        (f) => def.effect[f] !== undefined,
      );
      if (hasStatBonuses) {
        throw new Error(
          `apply_periodic_hp_effect cannot use stat-bonus effect "${action.effectName}". ` +
            `Use apply_stat_effect instead.`,
        );
      }
      return {
        type: 'apply_periodic_hp_effect',
        effectBlock: {
          effectMatrixName: action.matrix.matrixName,
          level: action.level,
          effectDisplayName: action.displayName,
          effectName: action.effectName,
          duration: action.duration,
          // damageType here is a bridge field required by the legacy SkillEffectBlock shape.
          // Runtime scaling for new definitions comes from action.powerSource, not this field.
          // effectDamageType from the registry is NOT used here — it is used for validation only.
          damageType: action.powerSource === 'magical_strength' ? 'magical' : 'physical',
        },
        displayEffect: def.effect,
        direction: action.direction,
        powerSource: action.powerSource,
        powerMode: 'raw',
        matrix: action.matrix,
        duration: action.duration,
      };
    }

    case 'post_damage':
      return {
        type: 'post_damage',
        postDamageBlock: {
          type: action.postDamageType,
          level: action.level,
        },
      };

    case 'instant_effect':
      return {
        type: 'instant_effect',
        instantEffectBlock: {
          instantEffectMatrixName: action.matrix.matrixName,
          level: action.matrix.level,
          instantEffectType: action.instantEffectType,
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
