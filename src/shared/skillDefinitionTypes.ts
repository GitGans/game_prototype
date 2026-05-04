import type { DamageModifierType, PostDamageType, InstantEffectType } from './skillTypes';

// ---------------------------------------------------------------------------
// Target policy
// ---------------------------------------------------------------------------

/** Who this skill targets. */
export type SkillDefinitionTargetPolicy =
  | { type: 'friendly' }
  | { type: 'self' }
  | { type: 'enemy_melee' }
  | { type: 'enemy_ranged' };

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
 * `matrixName` is a string key into DAMAGE_MATRICES / EFFECT_MATRICES / INSTANT_EFFECT_MATRICES.
 * Names are unresolved string registry references at the contract layer — resolution happens in the compiler.
 * Concrete SkillPattern objects are resolved by the compiler or runtime bridge, not here.
 */
export type SkillDefinitionMatrixRef =
  | { kind: 'damage_matrix'; matrixName: string; level: number }
  | { kind: 'effect_matrix'; matrixName: string; level: number }
  | { kind: 'instant_effect_matrix'; matrixName: string; level: number };

/** Narrowed alias — use when a field must reference a damage matrix. */
export type SkillDefinitionDamageMatrixRef =
  Extract<SkillDefinitionMatrixRef, { kind: 'damage_matrix' }>;

/** Narrowed alias — use when a field must reference an effect matrix. */
export type SkillDefinitionEffectMatrixRef =
  Extract<SkillDefinitionMatrixRef, { kind: 'effect_matrix' }>;

/** Narrowed alias — use when a field must reference an instant-effect matrix. */
export type SkillDefinitionInstantEffectMatrixRef =
  Extract<SkillDefinitionMatrixRef, { kind: 'instant_effect_matrix' }>;

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
  | SkillDefinitionInstantEffectAction;

// --- Damage ---

/**
 * Flat authoring-level modifier. Maps to DamageModifierRef in the compiler.
 * Uses `modifierType` (not `type`) to avoid collision with the action discriminant.
 */
export interface SkillDefinitionDamageModifier {
  modifierType: DamageModifierType;
  level: number;
}

export interface SkillDefinitionDamageAction {
  type: 'damage';
  powerSource: SkillDefinitionPowerSource;
  matrix: SkillDefinitionDamageMatrixRef;
  modifiers?: SkillDefinitionDamageModifier[];
}

// --- Heal ---

export interface SkillDefinitionHealAction {
  type: 'heal';
  powerSource: SkillDefinitionPowerSource;
  // Heal currently uses damage_matrix refs for behavior-preserving migration.
  // This is an authoring-level reference, not a statement that heal is damage.
  matrix: SkillDefinitionDamageMatrixRef;
}

// --- Stat effect ---

export interface SkillDefinitionApplyStatEffectAction {
  type: 'apply_stat_effect';
  // Flat stat effects do not scale from caster power; magnitude is resolved by effectName + level.
  effectName: string;
  displayName: string;
  level: number;
  duration: number;
  matrix: SkillDefinitionEffectMatrixRef;
}

// --- Periodic HP effect ---

export interface SkillDefinitionApplyPeriodicHpEffectAction {
  type: 'apply_periodic_hp_effect';
  effectName: string;
  displayName: string;
  direction: 'heal' | 'damage';
  // Periodic HP scaling is explicit on the action.
  powerSource: SkillDefinitionPowerSource;
  level: number;
  duration: number;
  matrix: SkillDefinitionEffectMatrixRef;
}

// --- Post-damage ---

export interface SkillDefinitionPostDamageAction {
  type: 'post_damage';
  postDamageType: PostDamageType;
  level: number;
}

// --- Instant effect ---

export interface SkillDefinitionInstantEffectAction {
  type: 'instant_effect';
  instantEffectType: InstantEffectType;
  displayName: string;
  matrix: SkillDefinitionInstantEffectMatrixRef;
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
  definitionKind: 'action_skill';
  id: string;
  name: string;
  targetPolicy: SkillDefinitionTargetPolicy;
  // Ordered semantic actions. Compiler must preserve this order when building SkillUsePlan.
  actions: SkillDefinitionAction[];
}
