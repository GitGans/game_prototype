// This file is a compatibility adapter contract for the legacy skill migration.
// It is not the final skill-definition format.
// Compatibility markers such as legacy_enchantment_heal_power should be removed
// during the controlled business migration after preview and executor both read
// SkillUsePlan.

import type {
  DamageModifierBlock,
  DamageType,
  Effect,
  InstantEffectBlock,
  PostDamageBlock,
  Skill,
  SkillEffectBlock,
  SkillPattern,
} from '../shared/skillTypes';
import type { ActiveEffect } from '../shared/activeEffect';
import {
  DAMAGE_MATRICES,
  EFFECT_MATRICES,
  INSTANT_EFFECT_MATRICES,
  LEVELED_EFFECTS,
} from '../data/skillDefinitions';
import { effectiveStats } from './combat';

// ─── Targeting ────────────────────────────────────────────────────────────────

export type SkillTargetPolicy =
  | { type: 'friendly' }
  | { type: 'self' }
  | { type: 'enemy_melee' }
  | { type: 'enemy_ranged' };

export function isFriendlyOrSelfTargetPolicy(
  policy: SkillTargetPolicy,
): boolean {
  return policy.type === 'friendly' || policy.type === 'self';
}

export function isHostileTargetPolicy(
  policy: SkillTargetPolicy,
): boolean {
  return policy.type === 'enemy_melee' || policy.type === 'enemy_ranged';
}

export function isEnemyMeleeTargetPolicy(
  policy: SkillTargetPolicy,
): boolean {
  return policy.type === 'enemy_melee';
}

// ─── Power ────────────────────────────────────────────────────────────────────

// Compatibility marker only.
// Current enchantment-targeted healing scales from raw magicalDamage even when
// damageBlock is absent or has a different damageType.
// Remove this during the controlled business migration when heal actions get
// explicit physical_strength/magical_strength scaling.
export type PowerSource =
  | 'physical_strength'
  | 'magical_strength'
  | 'legacy_enchantment_heal_power';

export type PowerMode = 'raw' | 'effective';

// Subset of PowerSource valid for combat damage resolution.
// Use this in action types that map to legacy DamageType; excludes
// legacy_enchantment_heal_power which is a raw-only heal compatibility marker.
export type CombatPowerSource = 'physical_strength' | 'magical_strength';

export interface UnitPowerOwner {
  physicalDamage: number;
  magicalDamage: number;
}

// Must structurally match StatOwner in combat.ts, which is intentionally local.
export interface EffectiveUnitPowerOwner extends UnitPowerOwner {
  physicalDefense: number;
  magicalDefense: number;
  dodge: number;
  block: number;
  initiative: number;
  activeEffects: readonly ActiveEffect[];
}

// ─── Patterns ─────────────────────────────────────────────────────────────────

export type PatternRef =
  | { kind: 'damage_matrix'; matrixName: string; level: number }
  | { kind: 'effect_matrix'; matrixName: string; level: number }
  | { kind: 'instant_effect_matrix'; matrixName: string; level: number };

export type DamagePatternRef = Extract<PatternRef, { kind: 'damage_matrix' }>;
export type EffectPatternRef = Extract<PatternRef, { kind: 'effect_matrix' }>;
export type InstantEffectPatternRef = Extract<
  PatternRef,
  { kind: 'instant_effect_matrix' }
>;

// ─── Actions ──────────────────────────────────────────────────────────────────

export type SkillUseAction =
  | {
      type: 'damage';
      powerSource: CombatPowerSource;
      powerMode: 'effective';
      matrix: DamagePatternRef;
      modifiers?: DamageModifierBlock[];
    }
  | {
      type: 'heal';
      powerSource: PowerSource;
      powerMode: 'raw';
      matrix: DamagePatternRef;
    }
  | {
      type: 'apply_stat_effect';
      effectBlock: SkillEffectBlock;
      resolvedEffect: Effect;
      matrix: EffectPatternRef;
    }
  | {
      type: 'apply_periodic_hp_effect';
      effectBlock: SkillEffectBlock;
      displayEffect: Effect;
      direction: 'heal' | 'damage';
      powerSource: CombatPowerSource;
      powerMode: 'raw';
      matrix: EffectPatternRef;
      duration: number;
    }
  | {
      type: 'post_damage';
      postDamageBlock: PostDamageBlock;
    }
  | {
      type: 'instant_effect';
      instantEffectBlock: InstantEffectBlock;
      matrix: InstantEffectPatternRef;
    };

// ─── Plan ─────────────────────────────────────────────────────────────────────

export type SkillUsePlan = {
  skillId: string;
  name: string;
  targetPolicy: SkillTargetPolicy;
  // Actions are ordered in current runtime execution order.
  // Executors must process this array in order unless a later business migration
  // deliberately changes action scheduling semantics.
  actions: SkillUseAction[];
};

// ─── Pattern Resolver ─────────────────────────────────────────────────────────

type MatrixTableEntry = {
  levels: SkillPattern[];
};

function resolveMatrixLevel(
  matrix: MatrixTableEntry | undefined,
  matrixKind: string,
  matrixName: string,
  level: number,
): SkillPattern {
  if (!matrix) {
    throw new Error(`Unknown ${matrixKind} matrix: ${matrixName}`);
  }

  return matrix.levels[level - 1] ?? matrix.levels[0];
}

export function resolvePlanPattern(patternRef: PatternRef): SkillPattern {
  switch (patternRef.kind) {
    case 'damage_matrix':
      return resolveMatrixLevel(
        DAMAGE_MATRICES[patternRef.matrixName],
        'damage',
        patternRef.matrixName,
        patternRef.level,
      );

    case 'effect_matrix':
      return resolveMatrixLevel(
        EFFECT_MATRICES[patternRef.matrixName],
        'effect',
        patternRef.matrixName,
        patternRef.level,
      );

    case 'instant_effect_matrix':
      return resolveMatrixLevel(
        INSTANT_EFFECT_MATRICES[patternRef.matrixName],
        'instant effect',
        patternRef.matrixName,
        patternRef.level,
      );

    default: {
      const _exhaustive: never = patternRef;
      return _exhaustive;
    }
  }
}

// ─── Power Accessors ──────────────────────────────────────────────────────────

export function getRawUnitPower(
  unit: UnitPowerOwner,
  powerSource: PowerSource,
): number {
  switch (powerSource) {
    case 'physical_strength':
      return unit.physicalDamage;

    case 'magical_strength':
      return unit.magicalDamage;

    case 'legacy_enchantment_heal_power':
      return unit.magicalDamage;

    default: {
      const _exhaustive: never = powerSource;
      return _exhaustive;
    }
  }
}

// legacy_enchantment_heal_power is intentionally excluded:
// it is only valid as a raw heal compatibility source.
export function getEffectiveUnitPower(
  unit: EffectiveUnitPowerOwner,
  powerSource: Exclude<PowerSource, 'legacy_enchantment_heal_power'>,
): number {
  const stats = effectiveStats(unit);

  switch (powerSource) {
    case 'physical_strength':
      return stats.physicalDamage;

    case 'magical_strength':
      return stats.magicalDamage;

    default: {
      const _exhaustive: never = powerSource;
      return _exhaustive;
    }
  }
}

// ─── Combat Bridge ────────────────────────────────────────────────────────────

// Maps CombatPowerSource to the legacy DamageType used by existing combat APIs.
// Centralizes the physical_strength -> 'physical', magical_strength -> 'magical'
// mapping so Stage 8 and Stage 9 consumers do not implement it independently.
export function getDamageTypeForPowerSource(
  powerSource: CombatPowerSource,
): DamageType {
  switch (powerSource) {
    case 'physical_strength':
      return 'physical';

    case 'magical_strength':
      return 'magical';

    default: {
      const _exhaustive: never = powerSource;
      return _exhaustive;
    }
  }
}

// ─── Legacy Compiler ──────────────────────────────────────────────────────────

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

// Intentionally mirrors resolveEffectArgs legacy bonus resolution.
// Remove/merge this after preview and executor no longer call resolveEffectArgs.
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

  // Fallback: fixed effect with no scaling — mirrors resolveEffectArgs [def.effect, undefined].
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
