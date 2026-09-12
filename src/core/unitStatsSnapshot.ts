import type { UnitBlueprint, UnitLifeState, UnitProgressionStatModifiers } from '../shared/unitTypes';
import type { ItemContainer, ItemInstance, ItemDefinition, PartialBattleStatBonuses } from '../shared/itemTypes';
import type { UnitStatsSnapshot } from '../shared/snapshotTypes';
import { getEquippedBonuses } from '../inventory';
import { resolveUnitBattleStats } from '../progression';
import { clampAliveCurrentHp } from './playerUnitPersistence';

/**
 * Persistent health of the character being projected. Required, and deliberately not
 * defaulted: "assume full HP" is the defect this parameter exists to remove.
 */
export interface UnitStatsHealthInput {
  currentHp: number | null;   // null === full HP (sparse roster form)
  lifeState: UnitLifeState;
}

export function buildUnitStatsSnapshot(
  blueprint:        UnitBlueprint,
  level:            number,
  permanentBonuses: PartialBattleStatBonuses,
  itemContainers:   Record<string, ItemContainer>,
  itemInstances:    Record<string, ItemInstance>,
  itemDefinitions:  Record<string, ItemDefinition>,
  upgradeModifiers: UnitProgressionStatModifiers,
  health:           UnitStatsHealthInput,
): UnitStatsSnapshot {
  const equipmentBonuses = getEquippedBonuses(
    blueprint.templateId, itemContainers, itemInstances, itemDefinitions,
  );

  // Color baseline: everything EXCEPT equipment (permanent bonuses are included,
  // so they change the number but never the color).
  const highlightBaseStats = resolveUnitBattleStats({
    blueprint,
    level,
    upgradeModifiers,
    permanentBonuses,
  });

  // Displayed value: highlight baseline + equipment.
  const displayStats = resolveUnitBattleStats({
    blueprint,
    level,
    upgradeModifiers,
    equipmentBonuses,
    permanentBonuses,
  });

  const pair = (k: keyof typeof displayStats) => ({
    highlightBase: highlightBaseStats[k],
    value:         displayStats[k],
  });

  // Current HP is normalized against the max THIS call just resolved — the only place
  // that number exists. The clamp rule itself stays owned by `playerUnitPersistence`;
  // this only applies it. `clampAliveCurrentHp` has a floor of 1 (an alive unit is
  // never at 0), so death is handled before it, not inside it.
  const currentHp = health.lifeState === 'dead'
    ? 0
    : clampAliveCurrentHp(health.currentHp, displayStats.hp);

  return {
    level,
    // Current HP is not an additive stat total: it has no equipment delta, so the pair is
    // neutral and the HP row is colored from `maxHp`. Identical to the battle projection
    // in `battleSnapshotBuilder.ts`, so one type never carries two meanings.
    hp:               { highlightBase: currentHp, value: currentHp },
    maxHp:            pair('hp'),
    physicalStrength: pair('physicalStrength'),
    magicalStrength:  pair('magicalStrength'),
    physicalDefense:  pair('physicalDefense'),
    magicalDefense:   pair('magicalDefense'),
    dodge:            pair('dodge'),
    block:            pair('block'),
    initiative:       pair('initiative'),
  };
}
