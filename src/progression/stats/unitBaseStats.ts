import type { UnitBlueprint, UnitBattleStats } from '../../shared/unitTypes';

/**
 * Single source of truth for level-based stat growth.
 *
 * scale = 1 + 0.1 * (level - 1)
 * hp / physicalStrength / magicalStrength scale with level (rounded);
 * all other stats are taken flat from the blueprint.
 */
export function computeUnitBaseStatsForLevel(
  blueprint: UnitBlueprint,
  level: number,
): UnitBattleStats {
  const scale = 1 + 0.1 * (level - 1);
  return {
    hp:               Math.round(blueprint.hp               * scale),
    physicalStrength: Math.round(blueprint.physicalStrength * scale),
    magicalStrength:  Math.round(blueprint.magicalStrength  * scale),
    physicalDefense:  blueprint.physicalDefense,
    magicalDefense:   blueprint.magicalDefense,
    dodge:            blueprint.dodge,
    block:            blueprint.block,
    initiative:       blueprint.initiative,
  };
}
