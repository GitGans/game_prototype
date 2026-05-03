import {
  CellCoord,
  OccupancyMap,
  Skill,
  Unit,
} from './types';
import type { Rng } from '../shared/random';
import { pickOneOrNull, randomInt } from '../shared/random';
import { cellKey } from './field';

interface SkillOwner { skills: readonly Skill[]; activeSkillIndex: number; }

/** Returns the active skill for a unit, falling back to the first skill. */
export function getActiveSkill(unit: SkillOwner): Skill {
  return unit.skills[unit.activeSkillIndex] ?? unit.skills[0];
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
