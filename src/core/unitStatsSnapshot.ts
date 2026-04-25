import type {
  UnitBlueprint,
  ItemContainer,
  ItemInstance,
  ItemDefinition,
  UnitBattleStats,
  BattleStatBonuses,
  UnitProgressionStatModifiers,
} from '../battle/types';
import type { UnitStatsSnapshot } from './phases';
import { computeUnitBattleStats } from '../battle/itemOps';

// Must match the base stat scaling rules used by computeUnitBattleStats().
function computeBaseStats(blueprint: UnitBlueprint, level: number): UnitBattleStats {
  const scale = 1 + 0.1 * (level - 1);
  return {
    hp:              Math.round(blueprint.hp             * scale),
    physicalDamage:  Math.round(blueprint.physicalDamage * scale),
    magicalDamage:   Math.round(blueprint.magicalDamage  * scale),
    physicalDefense: blueprint.physicalDefense,
    magicalDefense:  blueprint.magicalDefense,
    dodge:           blueprint.dodge,
    block:           blueprint.block,
    initiative:      blueprint.initiative,
  };
}

export function buildUnitStatsSnapshot(
  blueprint:        UnitBlueprint,
  level:            number,
  permanentBonuses: Partial<BattleStatBonuses>,
  itemContainers:   Record<string, ItemContainer>,
  itemInstances:    Record<string, ItemInstance>,
  itemDefinitions:  Record<string, ItemDefinition>,
  upgradeModifiers: UnitProgressionStatModifiers,
): UnitStatsSnapshot {
  const base  = computeBaseStats(blueprint, level);
  const final = computeUnitBattleStats(
    blueprint,
    level,
    itemContainers,
    itemInstances,
    itemDefinitions,
    { [blueprint.templateId]: permanentBonuses },
    upgradeModifiers,
  );

  return {
    level,
    hp:              { base: base.hp,              value: final.hp              },
    maxHp:           { base: base.hp,              value: final.hp              },
    physicalDamage:  { base: base.physicalDamage,  value: final.physicalDamage  },
    magicalDamage:   { base: base.magicalDamage,   value: final.magicalDamage   },
    physicalDefense: { base: base.physicalDefense, value: final.physicalDefense },
    magicalDefense:  { base: base.magicalDefense,  value: final.magicalDefense  },
    dodge:           { base: base.dodge,           value: final.dodge           },
    block:           { base: base.block,           value: final.block           },
    initiative:      { base: base.initiative,      value: final.initiative      },
  };
}
