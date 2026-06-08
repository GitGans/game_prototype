import type { UnitBlueprint, UnitProgressionStatModifiers } from '../shared/unitTypes';
import type { ItemContainer, ItemInstance, ItemDefinition, BattleStatBonuses } from '../shared/itemTypes';
import type { UnitStatsSnapshot } from '../shared/snapshotTypes';
import { getEquippedBonuses } from '../inventory';
import { computeUnitBaseStatsForLevel, resolveUnitBattleStats } from '../progression';

export function buildUnitStatsSnapshot(
  blueprint:        UnitBlueprint,
  level:            number,
  permanentBonuses: Partial<BattleStatBonuses>,
  itemContainers:   Record<string, ItemContainer>,
  itemInstances:    Record<string, ItemInstance>,
  itemDefinitions:  Record<string, ItemDefinition>,
  upgradeModifiers: UnitProgressionStatModifiers,
): UnitStatsSnapshot {
  const base = computeUnitBaseStatsForLevel(blueprint, level);
  const equipmentBonuses = getEquippedBonuses(
    blueprint.templateId, itemContainers, itemInstances, itemDefinitions,
  );
  const final = resolveUnitBattleStats({
    blueprint,
    level,
    upgradeModifiers,
    equipmentBonuses,
    permanentBonuses,
  });

  return {
    level,
    hp:              { base: base.hp,              value: final.hp              },
    maxHp:           { base: base.hp,              value: final.hp              },
    physicalStrength:  { base: base.physicalStrength,  value: final.physicalStrength  },
    magicalStrength:   { base: base.magicalStrength,   value: final.magicalStrength   },
    physicalDefense: { base: base.physicalDefense, value: final.physicalDefense },
    magicalDefense:  { base: base.magicalDefense,  value: final.magicalDefense  },
    dodge:           { base: base.dodge,           value: final.dodge           },
    block:           { base: base.block,           value: final.block           },
    initiative:      { base: base.initiative,      value: final.initiative      },
  };
}
