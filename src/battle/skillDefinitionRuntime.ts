import type { DamageModifierRef, PostDamageEffect } from '../shared/skillTypes';
import {
  DAMAGE_MODIFIER_LEVELS,
  REVIVE_HP_PERCENT_LEVELS,
  VAMPIRISM_LEVELS,
} from '../data/skills';
import { requireSkillLevel } from './skillLevels';
import type { ReviveEffect } from './skillUsePlan';

/** Returns the ignore-% for a DamageModifierRef. Missing levels throw. */
export function getDamageModifierPercent(modifier: DamageModifierRef): number {
  const levels = DAMAGE_MODIFIER_LEVELS[modifier.type];
  return requireSkillLevel(levels, modifier.level, `damage modifier "${modifier.type}"`);
}

/** Returns the vampirism-% for a PostDamageEffect. Missing levels throw. */
export function getVampirismPercent(postDamage: PostDamageEffect): number {
  return requireSkillLevel(VAMPIRISM_LEVELS, postDamage.level, 'vampirism');
}

/** Returns the percent of maxHp restored on revive. Missing levels throw. */
export function getReviveHpPercent(revive: ReviveEffect): number {
  return requireSkillLevel(REVIVE_HP_PERCENT_LEVELS, revive.level, 'revive');
}
