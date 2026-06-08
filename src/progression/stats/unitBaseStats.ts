import type { UnitBlueprint, UnitBattleStats } from '../../shared/unitTypes';

/**
 * Single source of truth for automatic, level-based stat growth.
 *
 * Growth is tiered by the level being gained:
 *   gained level 2-4   => +10% of blueprint
 *   gained level 5-9   => +12% of blueprint
 *   gained level 10-14 => +14% of blueprint
 *   gained level 15-19 => +16% of blueprint
 *   gained level 20+   => +18% of blueprint
 *
 * The rate is selected by the level being gained.
 * Gained levels run from 2 through the final level.
 * Level 1 has no growth and equals blueprint stats.
 *
 * Growth is cumulative and additive (% of blueprint per gained level), NOT
 * multiplicative compounding. Arithmetic is done in integer percentage points
 * to avoid floating-point drift around Math.round boundaries.
 *
 * hp / physicalStrength / magicalStrength scale with level (rounded);
 * all other stats are taken flat from the blueprint.
 */

// Both helpers are FILE-PRIVATE (not exported). The only public surface is
// computeUnitBaseStatsForLevel, which carries the level-validity guard. Keeping
// the helpers internal means no caller can reach them without the guard, so the
// integer-percent math is tested through computeUnitBaseStatsForLevel.

/** Growth contributed by reaching `gainedLevel`, in integer percentage points. */
function getGrowthPercentForGainedLevel(gainedLevel: number): number {
  if (gainedLevel <= 4)  return 10;
  if (gainedLevel <= 9)  return 12;
  if (gainedLevel <= 14) return 14;
  if (gainedLevel <= 19) return 16;
  return 18;
}

/**
 * Total growth at `level`, in integer percentage points above blueprint.
 * Level 1 => 0. Each gained level from 2..level adds its band rate.
 */
function computeCumulativeGrowthPercent(level: number): number {
  let percent = 0;
  for (let gainedLevel = 2; gainedLevel <= level; gainedLevel++) {
    percent += getGrowthPercentForGainedLevel(gainedLevel);
  }
  return percent;
}

/** Apply integer-percent growth to a single blueprint stat, rounded once. */
function scaleStat(blueprintStat: number, growthPercent: number): number {
  return Math.round((blueprintStat * (100 + growthPercent)) / 100);
}

export function computeUnitBaseStatsForLevel(
  blueprint: UnitBlueprint,
  level: number,
): UnitBattleStats {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error(
      `computeUnitBaseStatsForLevel: level must be an integer >= 1, got ${level}`,
    );
  }

  const growthPercent = computeCumulativeGrowthPercent(level);
  return {
    hp:               scaleStat(blueprint.hp,               growthPercent),
    physicalStrength: scaleStat(blueprint.physicalStrength, growthPercent),
    magicalStrength:  scaleStat(blueprint.magicalStrength,  growthPercent),
    physicalDefense:  blueprint.physicalDefense,
    magicalDefense:   blueprint.magicalDefense,
    dodge:            blueprint.dodge,
    block:            blueprint.block,
    initiative:       blueprint.initiative,
  };
}
