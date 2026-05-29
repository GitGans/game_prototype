import type { DamageModifierType, PostDamageType, ProbabilityEffectType, SkillLevel } from './skillTypes';

// ---------------------------------------------------------------------------
// Skill ID
// ---------------------------------------------------------------------------

declare const __skillIdBrand: unique symbol;

/**
 * Branded string that identifies a skill in the SKILLS registry.
 * At runtime this is a plain string; the brand exists only for TypeScript
 * to distinguish arbitrary strings from validated skill references.
 *
 * Never construct via cast (`"foo" as SkillId`). Use `sid()` from
 * `src/data/skillDefinitions.ts` — it validates the key against the registry.
 */
export type SkillId = string & { readonly [__skillIdBrand]: never };

// ---------------------------------------------------------------------------
// Target policy
// ---------------------------------------------------------------------------

/** Who this skill targets. */
export type SkillDefinitionTargetPolicy =
  | { type: 'friendly' }
  | { type: 'self' }
  | { type: 'enemy_melee' }
  | { type: 'enemy_ranged' }
  | { type: 'dead_ally_field_unit' };

// ---------------------------------------------------------------------------
// Power sources
// ---------------------------------------------------------------------------

/** Caster stat used for scaling damage, healing, or periodic HP. */
export type SkillDefinitionPowerSource =
  | 'physical_strength'
  | 'magical_strength';

// ---------------------------------------------------------------------------
// Matrix refs
// ---------------------------------------------------------------------------

/**
 * An unresolved reference to a named matrix entry in a registry.
 * `matrixName` is a string key into MULTIPLIER_MATRICES / EFFECT_AREA_MATRICES / PROBABILITY_MATRICES.
 * Names are unresolved string registry references at the contract layer — resolution happens in the compiler.
 * Concrete SkillPattern objects are resolved by the compiler or runtime bridge, not here.
 */
export type SkillDefinitionMatrixRef =
  | { kind: 'multiplier_matrix'; matrixName: string; level: SkillLevel }
  | { kind: 'effect_area_matrix'; matrixName: string }
  | { kind: 'probability_matrix'; matrixName: string; level: SkillLevel };

/** Narrowed alias — use when a field must reference a multiplier matrix. */
export type SkillDefinitionMultiplierMatrixRef =
  Extract<SkillDefinitionMatrixRef, { kind: 'multiplier_matrix' }>;

/** Narrowed alias — use when a field must reference an effect area matrix. */
export type SkillDefinitionEffectAreaMatrixRef =
  Extract<SkillDefinitionMatrixRef, { kind: 'effect_area_matrix' }>;

/** Narrowed alias — use when a field must reference a probability matrix. */
export type SkillDefinitionProbabilityMatrixRef =
  Extract<SkillDefinitionMatrixRef, { kind: 'probability_matrix' }>;

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** All possible semantic actions an ActionSkillDefinition can declare. */
export type SkillDefinitionAction =
  | SkillDefinitionDamageAction
  | SkillDefinitionHealAction
  | SkillDefinitionApplyStatEffectAction
  | SkillDefinitionApplyPeriodicHpEffectAction
  | SkillDefinitionPostDamageAction
  | SkillDefinitionProbabilityAction;

// --- Damage ---

/**
 * Flat authoring-level modifier. Maps to DamageModifierRef in the compiler.
 * Uses `modifierType` (not `type`) to avoid collision with the action discriminant.
 */
export interface SkillDefinitionDamageModifier {
  modifierType: DamageModifierType;
  level: SkillLevel;
}

export interface SkillDefinitionDamageAction {
  type: 'damage';
  powerSource: SkillDefinitionPowerSource;
  matrix: SkillDefinitionMultiplierMatrixRef;
  modifiers?: SkillDefinitionDamageModifier[];
}

// --- Heal ---

export interface SkillDefinitionHealAction {
  type: 'heal';
  powerSource: SkillDefinitionPowerSource;
  // Both damage and heal actions use multiplier_matrix refs.
  matrix: SkillDefinitionMultiplierMatrixRef;
}

// --- Stat effect ---

export interface SkillDefinitionApplyStatEffectAction {
  type: 'apply_stat_effect';
  // Flat stat effects do not scale from caster power; magnitude is resolved by effectName + level.
  effectName: string;
  displayName: string;
  level: SkillLevel;
  duration: number;
  matrix: SkillDefinitionEffectAreaMatrixRef;
}

// --- Periodic HP effect ---

export interface SkillDefinitionApplyPeriodicHpEffectAction {
  type: 'apply_periodic_hp_effect';
  effectName: string;
  displayName: string;
  direction: 'heal' | 'damage';
  // Periodic HP scaling is explicit on the action.
  powerSource: SkillDefinitionPowerSource;
  level: SkillLevel;
  duration: number;
  matrix: SkillDefinitionMultiplierMatrixRef;
}

// --- Post-damage ---

export interface SkillDefinitionPostDamageAction {
  type: 'post_damage';
  postDamageType: PostDamageType;
  level: SkillLevel;
}

// --- Probability effect ---

export interface SkillDefinitionProbabilityAction {
  type: 'probability_effect';
  probabilityEffectType: ProbabilityEffectType;
  displayName: string;
  matrix: SkillDefinitionProbabilityMatrixRef;
}

// ---------------------------------------------------------------------------
// Top-level definition
// ---------------------------------------------------------------------------

/**
 * Future authoring contract for action skills.
 * Active skill authoring contract. Sole source format for all skills in data/skillDefinitions.ts.
 *
 * Stores intent and registry refs — does NOT contain resolved runtime objects.
 * The compiler (compileSkillUsePlan) maps it to a SkillUsePlan.
 */
export interface ActionSkillDefinition {
  id: string;
  name: string;
  targetPolicy: SkillDefinitionTargetPolicy;
  // Ordered semantic actions. Compiler must preserve this order when building SkillUsePlan.
  actions: SkillDefinitionAction[];
}
