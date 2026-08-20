import type { RosterState } from '../progression';
import type { InventoryState } from '../inventory';

/** Core-only routing key: which runtime owns a given PlayerSessionState. */
export type PlayerSessionSource = 'campaign' | 'debug';

/** Core-only composition of the two player-owned domains. */
export interface PlayerSessionState {
  roster: RosterState;
  inventory: InventoryState;
}
