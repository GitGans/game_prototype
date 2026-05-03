import type {
  DamageModifierBlock,
  PostDamageBlock,
} from "../shared/skillTypes";
import {
  DAMAGE_MODIFIER_LEVELS,
  VAMPIRISM_LEVELS,
} from "../data/skillDefinitions";

/** Returns the ignore-% for a DamageModifierBlock (1-based level, clamped). */
export function getDamageModifierPercent(block: DamageModifierBlock): number {
  const levels = DAMAGE_MODIFIER_LEVELS[block.type];
  return levels[Math.min(block.level, levels.length) - 1];
}

/** Returns the vampirism-% for a PostDamageBlock (1-based level, clamped). */
export function getVampirismPercent(block: PostDamageBlock): number {
  return VAMPIRISM_LEVELS[Math.min(block.level, VAMPIRISM_LEVELS.length) - 1];
}
