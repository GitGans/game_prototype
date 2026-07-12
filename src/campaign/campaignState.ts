import type { RosterState } from '../progression';
import type { InventoryState } from '../inventory';
import type { WorldState } from '../world/types';

/** Persistent, JSON-compatible campaign state. The only future save source. */
export interface CampaignState {
  roster: RosterState;
  inventory: InventoryState;
  world: WorldState;
  money: number;
}
