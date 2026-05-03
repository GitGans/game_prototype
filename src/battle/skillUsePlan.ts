// This file is a compatibility adapter contract for the legacy skill migration.
// It is not the final skill-definition format.
// Compatibility markers such as legacy_enchantment_heal_power should be removed
// during the controlled business migration after preview and executor both read
// SkillUsePlan.

import type {
  DamageModifierBlock,
  Effect,
  InstantEffectBlock,
  PostDamageBlock,
  SkillEffectBlock,
} from '../shared/skillTypes';

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
