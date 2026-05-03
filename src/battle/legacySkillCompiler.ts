import type {
  DamageType,
  Effect,
  Skill,
  SkillEffectBlock,
} from '../shared/skillTypes';
import { LEVELED_EFFECTS } from '../data/skillDefinitions';
import {
  isFriendlyOrSelfTargetPolicy,
  isHostileTargetPolicy,
  type CombatPowerSource,
  type DamagePatternRef,
  type EffectPatternRef,
  type SkillTargetPolicy,
  type SkillUseAction,
  type SkillUsePlan,
} from './skillUsePlan';

function compileTargetPolicy(skill: Skill): SkillTargetPolicy {
  switch (skill.actionType) {
    case 'mass_enchantment':
      return { type: 'friendly' };
    case 'self_enchantment':
      return { type: 'self' };
    case 'melee':
      return { type: 'enemy_melee' };
    case 'ranged':
      return { type: 'enemy_ranged' };
    default: {
      const _exhaustive: never = skill.actionType;
      return _exhaustive;
    }
  }
}

function combatPowerSourceFromDamageType(
  damageType: DamageType,
): CombatPowerSource {
  switch (damageType) {
    case 'physical':
      return 'physical_strength';
    case 'magical':
      return 'magical_strength';
    default: {
      const _exhaustive: never = damageType;
      return _exhaustive;
    }
  }
}

function compileLegacyDamagePatternRef(skill: Skill): DamagePatternRef {
  if (skill.damageBlock) {
    return {
      kind: 'damage_matrix',
      matrixName: skill.damageBlock.matrixName,
      level: skill.damageBlock.level,
    };
  }
  return { kind: 'damage_matrix', matrixName: 'single', level: 1 };
}

// Mirrors resolveEffectArgs legacy bonus resolution.
function resolveLegacyStatEffect(block: SkillEffectBlock): Effect {
  const def = LEVELED_EFFECTS[block.effectName];
  if (!def) {
    throw new Error(`Unknown leveled effect: ${block.effectName}`);
  }
  if (!def.bonusByLevel) {
    return def.effect;
  }
  const bonus = def.bonusByLevel[block.level - 1] ?? def.bonusByLevel[0];
  const base = def.effect;
  const resolved: Effect = { ...base };
  const bonusFields = [
    'physicalDefenseBonus',
    'magicalDefenseBonus',
    'dodgeBonus',
    'blockBonus',
    'initiativeBonus',
    'physicalDamageBonus',
    'magicalDamageBonus',
  ] as const;
  for (const field of bonusFields) {
    if (base[field] !== undefined) {
      (resolved as unknown as Record<string, number>)[field] =
        Math.sign(base[field]!) * bonus;
    }
  }
  return resolved;
}

function compileLegacyEffectActions(skill: Skill): SkillUseAction[] {
  if (!skill.effectBlock) {
    return [];
  }
  const block = skill.effectBlock;
  const def = LEVELED_EFFECTS[block.effectName];
  if (!def) {
    throw new Error(`Unknown leveled effect: ${block.effectName}`);
  }
  const matrix: EffectPatternRef = {
    kind: 'effect_matrix',
    matrixName: block.effectMatrixName,
    level: block.level,
  };
  // Mirrors resolveEffectArgs exactly: effectDamageType wins over bonusByLevel.
  if (def.effectDamageType !== undefined) {
    return [
      {
        type: 'apply_periodic_hp_effect',
        effectBlock: block,
        displayEffect: def.effect,
        direction: def.effect.isBuff ? 'heal' : 'damage',
        // Scaling comes from LEVELED_EFFECTS.effectDamageType, NOT block.damageType.
        powerSource: combatPowerSourceFromDamageType(def.effectDamageType),
        powerMode: 'raw',
        matrix,
        duration: block.duration,
      },
    ];
  }
  if (def.bonusByLevel !== undefined) {
    return [
      {
        type: 'apply_stat_effect',
        effectBlock: block,
        resolvedEffect: resolveLegacyStatEffect(block),
        matrix,
      },
    ];
  }
  // Fallback: fixed effect with no scaling.
  return [
    {
      type: 'apply_stat_effect',
      effectBlock: block,
      resolvedEffect: def.effect,
      matrix,
    },
  ];
}

export function compileLegacySkill(skill: Skill): SkillUsePlan {
  const targetPolicy = compileTargetPolicy(skill);
  const actions: SkillUseAction[] = [];

  if (isFriendlyOrSelfTargetPolicy(targetPolicy)) {
    // Current enchantment-targeted runtime always heals and ignores post/instant blocks.
    actions.push({
      type: 'heal',
      powerSource: 'legacy_enchantment_heal_power',
      powerMode: 'raw',
      matrix: compileLegacyDamagePatternRef(skill),
    });
  }

  if (isHostileTargetPolicy(targetPolicy)) {
    const damageType = skill.damageBlock?.damageType ?? 'physical';
    actions.push({
      type: 'damage',
      powerSource: combatPowerSourceFromDamageType(damageType),
      powerMode: 'effective',
      matrix: compileLegacyDamagePatternRef(skill),
      modifiers: skill.damageModifierBlocks,
    });
    if (skill.postDamageBlock) {
      actions.push({
        type: 'post_damage',
        postDamageBlock: skill.postDamageBlock,
      });
    }
  }

  // Both friendly/self and hostile policies support effects.
  actions.push(...compileLegacyEffectActions(skill));

  if (isHostileTargetPolicy(targetPolicy) && skill.instantEffectBlock) {
    actions.push({
      type: 'instant_effect',
      instantEffectBlock: skill.instantEffectBlock,
      matrix: {
        kind: 'instant_effect_matrix',
        matrixName: skill.instantEffectBlock.instantEffectMatrixName,
        level: skill.instantEffectBlock.level,
      },
    });
  }

  return {
    skillId: skill.id,
    name: skill.name,
    targetPolicy,
    actions,
  };
}
