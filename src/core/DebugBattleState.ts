import { ItemInstance, ItemContainer, CellCoord, PartialBattleStatBonuses } from '../battle/types';
import { PLAYER_UNITS } from '../data/units';
import { ITEM_CATALOG, ITEM_DEFINITIONS } from '../data/itemDefinitions';
import { CAMPAIGN_STARTING_ITEMS } from '../data/startingInventoryDefinitions';
import { buildStartingInventory } from '../inventory';
import { assertStartingEquipmentClassRestrictions } from './startingInventoryValidation';
import type { UpgradeOptionId } from '../shared/unitTypes';

export interface DebugBattleState {
  level: number;
  campUnitIds: string[];
  itemInstances: Record<string, ItemInstance>;
  itemContainers: Record<string, ItemContainer>;
  unitPermanentBonuses: Record<string, PartialBattleStatBonuses>;
  playerUnitPlacements: Record<string, CellCoord>;
  playerBenchIds: string[] | null;
  chosenUpgrades: Record<string, Partial<Record<5 | 10 | 15 | 20, UpgradeOptionId>>>;
}

export function createDebugBattleState(level: number): DebugBattleState {
  // Same validation as campaign new_game — debug consumes the same content list,
  // so it must enforce the same class restrictions before building inventory.
  assertStartingEquipmentClassRestrictions({
    playerUnits: PLAYER_UNITS,
    itemDefinitions: ITEM_DEFINITIONS,
    startingItems: CAMPAIGN_STARTING_ITEMS,
  });
  const { itemInstances, itemContainers } = buildStartingInventory({
    playerUnitTemplateIds: PLAYER_UNITS.map(bp => bp.templateId),
    catalog: ITEM_CATALOG,
    startingItems: CAMPAIGN_STARTING_ITEMS,
    backpackId: 'backpack_debug',
  });
  return {
    level,
    campUnitIds: [],
    itemInstances,
    itemContainers,
    unitPermanentBonuses: {},
    playerUnitPlacements: {},
    playerBenchIds: null,
    chosenUpgrades: {},
  };
}
