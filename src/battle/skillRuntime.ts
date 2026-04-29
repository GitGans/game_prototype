import {
  BattleState,
  CellCoord,
  Effect,
  OccupancyMap,
  ResolvedHitCell,
  Skill,
  Unit,
} from './types';
import { resolvePattern } from './skillPatterns';
import {
  DAMAGE_MATRICES,
  LEVELED_EFFECTS,
  getSkillPattern,
  getEffectPattern,
} from '../data/skillDefinitions';
import {
  resolveAttack,
  resolveHeal,
  applyEffectBlock,
  applyVampirism,
  effectiveStats,
} from './combat';
import { cellKey } from './field';
import { resolveSkillTargets } from './targeting';

/** Returns the active skill for a unit, falling back to the first skill. */
export function getActiveSkill(unit: Unit): Skill {
  return unit.skills[unit.activeSkillIndex] ?? unit.skills[0];
}

/**
 * Resolves the hit cells for a unit's active skill at the given anchor.
 * Falls back to single-cell pattern if the skill has no damageBlock.
 */
export function getSkillHitCells(unit: Unit, anchor: CellCoord): ResolvedHitCell[] {
  const skill = getActiveSkill(unit);
  const pattern = skill?.damageBlock ? getSkillPattern(skill) : DAMAGE_MATRICES.single.levels[0];
  return resolvePattern(anchor, pattern);
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
export function resolveEffectArgs(skill: Skill, caster: Unit): [Effect, number | undefined] {
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
  rng: () => number = Math.random,
): CellCoord | null {
  if (targets.length === 0) return null;
  return targets[Math.floor(rng() * targets.length)];
}

/**
 * Returns a random skill index for the unit.
 * Preserves existing invariant: units are assumed to have at least one skill.
 * If unit.skills is empty, returns 0 and getActiveSkill will return undefined.
 */
export function resolveRandomSkillIndex(
  unit: Unit,
  rng: () => number = Math.random,
): number {
  return Math.floor(rng() * unit.skills.length);
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

/**
 * Computes one turn for the given unit and returns the resulting BattleState.
 * Pure — no Phaser, no animations, no GameState reads. Used by runQuickBattle().
 *
 * NOTE: autoTurn (handles enemy turns in manual mode; player/enemy turns in auto mode)
 * heal path intentionally does NOT apply effectBlock.
 * This gap between auto and quick is preserved in Stage 1. Fix in Stage 3.
 */
export function computeOneTurn(
  state: BattleState,
  unitId: string,
  rng: () => number = Math.random,
): BattleState {
  const unit = state.units.get(unitId);
  if (!unit) return state;

  // Immutable skill selection — does not mutate the unit object in the map
  const randomSkillIdx = resolveRandomSkillIndex(unit, rng);
  const updatedUnit = { ...unit, activeSkillIndex: randomSkillIdx };
  const updatedUnits = new Map(state.units);
  updatedUnits.set(unitId, updatedUnit);
  state = { ...state, units: updatedUnits };

  const skill = getActiveSkill(updatedUnit);
  const targets = resolveSkillTargets(updatedUnit, skill, state.occupancy);

  if (isEnchantmentSkill(skill)) {
    const target = resolveBestHealTarget(state.occupancy, targets);
    if (!target) return state;

    let next = resolveHeal(getSkillHitCells(updatedUnit, target), updatedUnit.magicalDamage, state);
    if (skill.effectBlock) {
      const [eff, perTurn] = resolveEffectArgs(skill, updatedUnit);
      next = applyEffectBlock(
        skill.effectBlock,
        getEffectPattern(skill.effectBlock),
        target,
        next,
        eff,
        perTurn,
      ).state;
    }
    return next;
  }

  const target = resolveRandomTarget(targets, rng);
  if (!target) return state;

  const damageType = skill.damageBlock?.damageType ?? 'physical';
  const casterStats = effectiveStats(updatedUnit);
  const baseDamage = damageType === 'physical' ? casterStats.physicalDamage : casterStats.magicalDamage;

  let next = state;
  if (skill.damageBlock) {
    const attackResult = resolveAttack(
      getSkillHitCells(updatedUnit, target),
      baseDamage,
      damageType,
      state,
      skill.damageModifierBlocks,
    );
    next = attackResult.state;
    if (skill.postDamageBlock && attackResult.totalRealDamage > 0) {
      next = applyVampirism(skill.postDamageBlock, updatedUnit, attackResult.totalRealDamage, next).state;
    }
  }
  if (skill.effectBlock) {
    const [eff, perTurn] = resolveEffectArgs(skill, updatedUnit);
    next = applyEffectBlock(
      skill.effectBlock,
      getEffectPattern(skill.effectBlock),
      target,
      next,
      eff,
      perTurn,
    ).state;
  }
  return next;
}
