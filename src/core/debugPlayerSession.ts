import type { UnitBlueprint } from '../shared/unitTypes';
import type { ItemCatalog } from '../shared/itemTypes';
import type { PlayerSessionState } from './playerSessionState';
import type { RosterState, PlayerUnitState } from '../progression';
import type { InventoryState } from '../inventory';
import type { DebugSessionConfig } from './DebugBattleState';
import { requireSharedBackpack, buildStartingInventory } from '../inventory';
import { assertStartingEquipmentClassRestrictions } from './startingInventoryValidation';

export interface CreateDebugPlayerSessionInput {
  config: DebugSessionConfig;
  playerUnits: readonly UnitBlueprint[];
  itemCatalog: ItemCatalog;
}

/** itemCatalog.definitions is the sole item-definition source — same rule as initCampaignState. */
export function createDebugPlayerSession(input: CreateDebugPlayerSessionInput): PlayerSessionState {
  const { config, playerUnits, itemCatalog } = input;

  if (!Number.isInteger(config.level) || config.level < 1) {
    throw new Error(`Debug level must be an integer >= 1; got ${config.level}`);
  }
  const templateIds = new Set<string>();
  for (const bp of playerUnits) {
    if (templateIds.has(bp.templateId)) throw new Error(`Duplicate player unit "${bp.templateId}"`);
    templateIds.add(bp.templateId);
  }
  const seenCamp = new Set<string>();
  for (const id of config.initialCampUnitIds) {
    if (!templateIds.has(id)) throw new Error(`Unknown camp unit "${id}"`);
    if (seenCamp.has(id)) throw new Error(`Duplicate camp unit "${id}"`);
    seenCamp.add(id);
  }

  const units: Record<string, PlayerUnitState> = {};
  for (const bp of playerUnits) {
    units[bp.templateId] = {
      level: config.level,
      isInCamp: config.initialCampUnitIds.includes(bp.templateId),
      lastPlacement: null,
      permanentBonuses: {},
      chosenUpgrades: {},
      lifeState: 'alive',
      currentHp: null,
    };
  }
  const roster: RosterState = { units };

  assertStartingEquipmentClassRestrictions({
    playerUnits, itemDefinitions: itemCatalog.definitions, startingItems: config.startingItems,
  });
  const { itemInstances, itemContainers } = buildStartingInventory({
    playerUnitTemplateIds: playerUnits.map(bp => bp.templateId),
    catalog: itemCatalog,
    startingItems: config.startingItems,
    backpackId: 'backpack_debug',
  });
  const inventory: InventoryState = { instances: itemInstances, containers: itemContainers };
  requireSharedBackpack(inventory);

  return { roster, inventory };
}
