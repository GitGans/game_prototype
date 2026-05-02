import {
  CellCoord,
  Effect,
  OccupancyMap,
  ResolvedHitCell,
  Skill,
  Unit,
} from './types';
import type { Rng } from '../shared/random';
import { pickOneOrNull, randomInt } from '../shared/random';
import { resolvePattern } from './skillPatterns';
import {
  DAMAGE_MATRICES,
  LEVELED_EFFECTS,
  getSkillPattern,
  getEffectPattern,
} from '../data/skillDefinitions';
import { cellKey } from './field';

interface SkillOwner { skills: readonly Skill[]; activeSkillIndex: number; }

/** Returns the active skill for a unit, falling back to the first skill. */
export function getActiveSkill(unit: SkillOwner): Skill {
  return unit.skills[unit.activeSkillIndex] ?? unit.skills[0];
}

/**
 * Resolves hit cells directly from a skill — does not read unit.activeSkillIndex.
 * Use this when the skill is already resolved by the caller (e.g. inside executeSkillUse).
 */
export function getSkillHitCellsForSkill(skill: Skill, anchor: CellCoord): ResolvedHitCell[] {
  const pattern = skill.damageBlock ? getSkillPattern(skill) : DAMAGE_MATRICES.single.levels[0];
  return resolvePattern(anchor, pattern);
}

/** Convenience wrapper — resolves the active skill from the unit, then delegates. */
export function getSkillHitCells(unit: SkillOwner, anchor: CellCoord): ResolvedHitCell[] {
  return getSkillHitCellsForSkill(getActiveSkill(unit), anchor);
}

/**
 * Returns true if the skill uses an enchantment action type (mass or self).
 * Name reflects action type classification, not presence of heal semantics.
 */
export function isEnchantmentSkill(skill: Skill): boolean {
  return skill.actionType === 'mass_enchantment' || skill.actionType === 'self_enchantment';
}

/**
 * Resolves the Effect object and computedPerTurn for a skill's effectBlock.
 * Caller must only invoke this when skill.effectBlock is defined.
 *
 * - Stat-based effects (regeneration / lose_health): computedPerTurn = casterStat × matrix multiplier
 * - Defense-only effects (fortify / weaken / etc.): returns Effect copy with level-specific bonus
 */
interface DamageOwner { physicalDamage: number; magicalDamage: number; }
export function resolveEffectArgs(skill: Skill, caster: DamageOwner): [Effect, number | undefined] {
  const eb = skill.effectBlock!;
  const def = LEVELED_EFFECTS[eb.effectName];

  if (def.effectDamageType !== undefined) {
    const pattern = getEffectPattern(eb);
    const anchorCell = pattern.cells[pattern.anchorRow][pattern.anchorCol]!;
    const stat = def.effectDamageType === 'physical' ? caster.physicalDamage : caster.magicalDamage;
    const computedPerTurn = Math.round(stat * anchorCell.damageMultiplier);
    return [def.effect, computedPerTurn];
  }

  if (def.bonusByLevel !== undefined) {
    const bonus = def.bonusByLevel[eb.level - 1] ?? def.bonusByLevel[0];
    const resolvedEffect: Effect = {
      ...def.effect,
      physicalDefenseBonus: def.effect.physicalDefenseBonus !== undefined
        ? Math.sign(def.effect.physicalDefenseBonus) * bonus : undefined,
      magicalDefenseBonus: def.effect.magicalDefenseBonus !== undefined
        ? Math.sign(def.effect.magicalDefenseBonus) * bonus : undefined,
      dodgeBonus: def.effect.dodgeBonus !== undefined
        ? Math.sign(def.effect.dodgeBonus) * bonus : undefined,
      blockBonus: def.effect.blockBonus !== undefined
        ? Math.sign(def.effect.blockBonus) * bonus : undefined,
      initiativeBonus: def.effect.initiativeBonus !== undefined
        ? Math.sign(def.effect.initiativeBonus) * bonus : undefined,
      physicalDamageBonus: def.effect.physicalDamageBonus !== undefined
        ? Math.sign(def.effect.physicalDamageBonus) * bonus : undefined,
      magicalDamageBonus: def.effect.magicalDamageBonus !== undefined
        ? Math.sign(def.effect.magicalDamageBonus) * bonus : undefined,
    };
    return [resolvedEffect, undefined];
  }

  return [def.effect, undefined];
}

/** Returns a random element from targets. Returns null if targets is empty. */
export function resolveRandomTarget(
  targets: CellCoord[],
  rng: Rng,
): CellCoord | null {
  return pickOneOrNull(rng, targets);
}

/**
 * Returns a random skill index for the unit.
 * Preserves existing invariant: units are assumed to have at least one skill.
 * If unit.skills is empty, returns 0 and getActiveSkill will return undefined.
 */
export function resolveRandomSkillIndex(
  unit: Unit,
  rng: Rng,
): number {
  // TODO(debt): units should be guaranteed to have at least one skill at creation.
  // Enforce at buildNewBattleState or unit factory level, then remove this guard.
  if (unit.skills.length === 0) return 0;
  return randomInt(rng, unit.skills.length);
}

/**
 * Returns the target with the lowest hp/maxHp ratio from the given list.
 * Returns null if targets is empty.
 */
export function resolveBestHealTarget(
  occupancy: OccupancyMap,
  targets: CellCoord[],
): CellCoord | null {
  if (targets.length === 0) return null;
  return targets.reduce((best, coord) => {
    const u = occupancy.cellToUnit.get(cellKey(coord));
    const bestU = occupancy.cellToUnit.get(cellKey(best));
    return u && bestU && u.hp / u.maxHp < bestU.hp / bestU.maxHp ? coord : best;
  });
}

