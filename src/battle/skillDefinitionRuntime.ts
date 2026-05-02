import type {
  DamageModifierBlock,
  InstantEffectBlock,
  PostDamageBlock,
  Skill,
  SkillEffectBlock,
  SkillPattern,
} from "../shared/skillTypes";
import {
  DAMAGE_MATRICES,
  DAMAGE_MODIFIER_LEVELS,
  EFFECT_MATRICES,
  INSTANT_EFFECT_MATRICES,
  VAMPIRISM_LEVELS,
} from "../data/skillDefinitions";

export function getSkillPattern(skill: Skill): SkillPattern {
  const db = skill.damageBlock!;
  const matrix = DAMAGE_MATRICES[db.matrixName];
  return matrix.levels[db.level - 1] ?? matrix.levels[0];
}

/**
 * Returns the SkillPattern for an effectBlock's level from EFFECT_MATRICES.
 * Falls back to level 1 if level exceeds the matrix's defined levels.
 */
export function getEffectPattern(block: SkillEffectBlock): SkillPattern {
  const matrix = EFFECT_MATRICES[block.effectMatrixName];
  return matrix.levels[block.level - 1] ?? matrix.levels[0];
}

/**
 * Returns the SkillPattern for an instantEffectBlock's level from INSTANT_EFFECT_MATRICES.
 * Falls back to level 1 if level exceeds the matrix's defined levels.
 */
export function getInstantEffectPattern(
  block: InstantEffectBlock,
): SkillPattern {
  const matrix = INSTANT_EFFECT_MATRICES[block.instantEffectMatrixName];
  return matrix.levels[block.level - 1] ?? matrix.levels[0];
}

/** Returns the ignore-% for a DamageModifierBlock (1-based level, clamped). */
export function getDamageModifierPercent(block: DamageModifierBlock): number {
  const levels = DAMAGE_MODIFIER_LEVELS[block.type];
  return levels[Math.min(block.level, levels.length) - 1];
}

/** Returns the vampirism-% for a PostDamageBlock (1-based level, clamped). */
export function getVampirismPercent(block: PostDamageBlock): number {
  return VAMPIRISM_LEVELS[Math.min(block.level, VAMPIRISM_LEVELS.length) - 1];
}
