import type { PlayerUnitState } from '../progression';
import type { ItemContainer, ItemInstance } from '../battle/types';

export interface PlayerBattleSetup {
  playerUnits:    Record<string, PlayerUnitState>;
  itemContainers: Record<string, ItemContainer>;
  itemInstances:  Record<string, ItemInstance>;
}
