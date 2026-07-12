import type { UnitBlueprint } from '../shared/unitTypes';
import type { ItemCatalog } from '../shared/itemTypes';
import type { StartingItemDefinition } from '../data/startingInventoryDefinitions';
import type { SubMapDefinition, SubMapState } from '../shared/worldTypes';
import type { CampaignState } from '../campaign';
import type { RosterState, PlayerUnitState } from '../progression';
import type { InventoryState } from '../inventory';
import type { WorldState } from '../world/types';
import type { CampaignInitialStateDefinition } from '../data/campaignInitialStateDefinition';
import { requireSharedBackpack, buildStartingInventory } from '../inventory';
import { initSubMapState } from '../world/mapLogic';
import { assertStartingEquipmentClassRestrictions } from './startingInventoryValidation';

export interface InitCampaignStateInput {
  playerUnits: readonly UnitBlueprint[];
  itemCatalog: ItemCatalog;
  startingItems: readonly StartingItemDefinition[];
  mapDefinitions: Record<string, SubMapDefinition>;
  initialState: CampaignInitialStateDefinition;
}

/**
 * Pure campaign factory. `itemCatalog.definitions` is the SOLE item-definition source — both
 * class-restriction validation and inventory construction read from it. Never import
 * ITEM_DEFINITIONS (or any other global content) here; doing so would let a caller supply one
 * catalog for construction while validation silently checks a different one, breaking the
 * factory's purity contract and making isolated tests / future alternate content sets unreliable.
 */
export function initCampaignState(input: InitCampaignStateInput): CampaignState {
  const { playerUnits, itemCatalog, startingItems, mapDefinitions, initialState } = input;

  // 1. validate initial-state definition
  if (!mapDefinitions[initialState.initialMapId]) {
    throw new Error(`Unknown initialMapId "${initialState.initialMapId}"`);
  }
  const templateIds = new Set<string>();
  for (const bp of playerUnits) {
    if (templateIds.has(bp.templateId)) throw new Error(`Duplicate player unit "${bp.templateId}"`);
    templateIds.add(bp.templateId);
  }
  const seenCamp = new Set<string>();
  for (const id of initialState.initialCampUnitIds) {
    if (!templateIds.has(id)) throw new Error(`Unknown camp unit "${id}"`);
    if (seenCamp.has(id)) throw new Error(`Duplicate camp unit "${id}"`);
    seenCamp.add(id);
  }

  // 2-5. roster
  const units: Record<string, PlayerUnitState> = {};
  for (const bp of playerUnits) {
    units[bp.templateId] = {
      level: bp.level,
      isInCamp: initialState.initialCampUnitIds.includes(bp.templateId),
      lastPlacement: null,
      permanentBonuses: {},
      chosenUpgrades: {},
      lifeState: 'alive',
      currentHp: null,
    };
  }
  const roster: RosterState = { units };

  // 6-9. inventory
  assertStartingEquipmentClassRestrictions({
    playerUnits, itemDefinitions: itemCatalog.definitions, startingItems,
  });
  const { itemInstances, itemContainers } = buildStartingInventory({
    playerUnitTemplateIds: playerUnits.map(bp => bp.templateId),
    catalog: itemCatalog,
    startingItems,
    backpackId: 'backpack_shared',
  });
  const inventory: InventoryState = { instances: itemInstances, containers: itemContainers };
  requireSharedBackpack(inventory);

  // 10-12. world — ALL static maps, not just initialMapId
  const subMapStates: Record<string, SubMapState> = {};
  for (const [mapId, def] of Object.entries(mapDefinitions)) {
    subMapStates[mapId] = initSubMapState(def);
  }
  // currentMapId/partyPos are persistent campaign location, not just render state.
  // Clone startPos: it belongs to the static, module-level MAP_DEFINITIONS content. Assigning
  // the reference directly would make runtime campaign state alias shared read-only content —
  // an in-place write to campaign.world.partyPos later would corrupt MAP_DEFINITIONS for every
  // future campaign, and would break this factory's own "fresh runtime tree per call" guarantee.
  const world: WorldState = {
    currentMapId: initialState.initialMapId,
    partyPos: { ...mapDefinitions[initialState.initialMapId].startPos },
    subMapStates,
  };

  // 13-14.
  return { roster, inventory, world, money: initialState.initialMoney };
}
