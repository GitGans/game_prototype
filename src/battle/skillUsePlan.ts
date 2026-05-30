// Runtime skill plan contract. Produced by compileSkillUsePlan; consumed by executor, preview, targeting, and presentation.

import type {
  Effect,
  DamageModifierRef,
  PostDamageEffect,
  ProbabilityEffectApplication,
  SkillLevel,
} from '../shared/skillTypes';
import type { SkillDefinitionTargetPolicy } from '../shared/skillDefinitionTypes';

export type { DamageModifierRef, PostDamageEffect, ProbabilityEffectApplication };

// ─── Targeting ────────────────────────────────────────────────────────────────

export type SkillTargetPolicy =
  | { type: 'alive_friendly' }
  | { type: 'self' }
  | { type: 'enemy_melee' }
  | { type: 'enemy_ranged' }
  | { type: 'dead_friendly' };

// Stops authoring/runtime policy drift at compile time.
// If a Stage 2+ change adds a policy on one side only, this will fail to build.
type _RuntimeMatchesAuthoring =
  SkillTargetPolicy extends SkillDefinitionTargetPolicy ? true : false;
type _AuthoringMatchesRuntime =
  SkillDefinitionTargetPolicy extends SkillTargetPolicy ? true : false;
const _parityRuntime: _RuntimeMatchesAuthoring = true;
const _parityAuthoring: _AuthoringMatchesRuntime = true;
void _parityRuntime;
void _parityAuthoring;

export function isAliveFriendlyTargetPolicy(
  policy: SkillTargetPolicy,
): boolean {
  return policy.type === 'alive_friendly';
}

export function isDeadFriendlyTargetPolicy(
  policy: SkillTargetPolicy,
): boolean {
  return policy.type === 'dead_friendly';
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
  | { kind: 'effect_area_matrix'; matrixName: string }
  | { kind: 'probability_matrix'; matrixName: string; level: SkillLevel };

export type MultiplierPatternRef = Extract<PatternRef, { kind: 'multiplier_matrix' }>;
export type EffectAreaPatternRef = Extract<PatternRef, { kind: 'effect_area_matrix' }>;
export type ProbabilityPatternRef = Extract<
  PatternRef,
  { kind: 'probability_matrix' }
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
      matrix: EffectAreaPatternRef;
    }
  | {
      type: 'apply_periodic_hp_effect';
      effect: EffectApplicationMeta;
      displayEffect: Effect;
      direction: 'heal' | 'damage';
      powerSource: CombatPowerSource;
      matrix: MultiplierPatternRef;
    }
  | {
      type: 'post_damage';
      postDamage: PostDamageEffect;
    }
  | {
      type: 'probability_effect';
      probabilityEffect: ProbabilityEffectApplication;
      matrix: ProbabilityPatternRef;
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
