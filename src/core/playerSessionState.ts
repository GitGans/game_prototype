import type { RosterState } from '../progression';
import type { InventoryState } from '../inventory';

/** Core-only composition of the two player-owned domains. */
export interface PlayerSessionState {
  roster: RosterState;
  inventory: InventoryState;
}
