// Runtime skill plan contract. Produced by compileSkillUsePlan; consumed by executor, preview, targeting, and presentation.

import type {
  Effect,
  DamageModifierRef,
  PostDamageEffect,
  InstantEffectApplication,
  SkillLevel,
} from '../shared/skillTypes';

export type { DamageModifierRef, PostDamageEffect, InstantEffectApplication };

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

export type PowerSource =
  | 'physical_strength'
  | 'magical_strength';

// Alias for PowerSource. Kept to avoid churn in combat callers.
export type CombatPowerSource = PowerSource;

// ─── Patterns ─────────────────────────────────────────────────────────────────

export type PatternRef =
  | { kind: 'multiplier_matrix'; matrixName: string; level: SkillLevel }
  | { kind: 'effect_matrix'; matrixName: string; level: SkillLevel }
  | { kind: 'instant_effect_matrix'; matrixName: string; level: SkillLevel };

export type MultiplierPatternRef = Extract<PatternRef, { kind: 'multiplier_matrix' }>;
export type EffectPatternRef = Extract<PatternRef, { kind: 'effect_matrix' }>;
export type InstantEffectPatternRef = Extract<
  PatternRef,
  { kind: 'instant_effect_matrix' }
>;

// ─── Semantic runtime helper types ────────────────────────────────────────────

// Shared meta for both stat effects and periodic HP effects.
// Superset of AppliedEffectMeta from shared/skillTypes.ts — assignable without cast.
export type EffectApplicationMeta = {
  effectName: string;
  displayName: string;
  level: SkillLevel;
  duration: number;
};

// ─── Actions ──────────────────────────────────────────────────────────────────

export type SkillUseAction =
  | {
      type: 'damage';
      powerSource: CombatPowerSource;
      matrix: MultiplierPatternRef;
      modifiers?: DamageModifierRef[];
    }
  | {
      type: 'heal';
      powerSource: PowerSource;
      matrix: MultiplierPatternRef;
    }
  | {
      type: 'apply_stat_effect';
      effect: EffectApplicationMeta;
      resolvedEffect: Effect;
      matrix: EffectPatternRef;
    }
  | {
      type: 'apply_periodic_hp_effect';
      effect: EffectApplicationMeta;
      displayEffect: Effect;
      direction: 'heal' | 'damage';
      powerSource: CombatPowerSource;
      matrix: EffectPatternRef;
    }
  | {
      type: 'post_damage';
      postDamage: PostDamageEffect;
    }
  | {
      type: 'instant_effect';
      instantEffect: InstantEffectApplication;
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
