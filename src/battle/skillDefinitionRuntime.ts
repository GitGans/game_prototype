import type { DamageModifierRef, PostDamageEffect } from '../shared/skillTypes';
import {
  DAMAGE_MODIFIER_LEVELS,
  VAMPIRISM_LEVELS,
} from "../data/skillDefinitions";

/** Returns the ignore-% for a DamageModifierRef (1-based level, clamped). */
export function getDamageModifierPercent(modifier: DamageModifierRef): number {
  const levels = DAMAGE_MODIFIER_LEVELS[modifier.type];
  return levels[Math.min(modifier.level, levels.length) - 1];
}

/** Returns the vampirism-% for a PostDamageEffect (1-based level, clamped). */
export function getVampirismPercent(postDamage: PostDamageEffect): number {
  return VAMPIRISM_LEVELS[Math.min(postDamage.level, VAMPIRISM_LEVELS.length) - 1];
}
