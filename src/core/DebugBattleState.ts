import { ItemInstance, ItemContainer, CellCoord, BattleStatBonuses } from '../battle/types';
import { PLAYER_UNITS } from '../data/unitDefinitions';
import type { UpgradeOptionId } from '../shared/unitTypes';

export interface DebugBattleState {
  level: number;
  campUnitIds: string[];
  itemInstances: Record<string, ItemInstance>;
  itemContainers: Record<string, ItemContainer>;
  unitPermanentBonuses: Record<string, Partial<BattleStatBonuses>>;
  playerUnitPlacements: Record<string, CellCoord>;
  playerBenchIds: string[] | null;
  chosenUpgrades: Record<string, Partial<Record<5 | 10 | 15 | 20, UpgradeOptionId>>>;
}

export function createDebugBattleState(level: number): DebugBattleState {
  const itemContainers: Record<string, ItemContainer> = {
    backpack_debug: { id: 'backpack_debug', kind: 'backpack', slots: {} },
  };
  for (const bp of PLAYER_UNITS) {
    itemContainers[`equip_${bp.templateId}`] = {
      id: `equip_${bp.templateId}`,
      kind: 'equipment',
      ownerTemplateId: bp.templateId,
      slots: {},
    };
  }
  const itemInstances: Record<string, ItemInstance> = {};
  let counter = 1;
  const add = (slot: string, defId: string) => {
    const id = `item_debug_${String(counter++).padStart(3, '0')}`;
    itemInstances[id] = { id, definitionId: defId };
    itemContainers['backpack_debug'].slots[slot] = id;
  };
  add('0', 'bronze_ring');
  add('1', 'iron_ring');
  add('2', 'bronze_necklace');
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
