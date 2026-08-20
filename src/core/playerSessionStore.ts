import { GameState } from './GameState';
import type { PlayerSessionSource, PlayerSessionState } from './playerSessionState';
import type { RosterState } from '../progression';
import type { InventoryState } from '../inventory';

export const PlayerSessionStore = {
  getSession(source: PlayerSessionSource): PlayerSessionState {
    if (source === 'campaign') {
      const campaign = GameState.getCampaignState();
      return { roster: campaign.roster, inventory: campaign.inventory };
    }
    const debugState = GameState.getDebugState();
    if (!debugState) throw new Error('Debug state is not initialized');
    return debugState.session;
  },

  replaceRoster(source: PlayerSessionSource, next: RosterState): void {
    if (source === 'campaign') {
      GameState.replaceCampaignRoster(next);
    } else {
      GameState.replaceDebugRoster(next);
    }
  },

  replaceInventory(source: PlayerSessionSource, next: InventoryState): void {
    if (source === 'campaign') {
      GameState.replaceCampaignInventory(next);
    } else {
      GameState.replaceDebugInventory(next);
    }
  },
};
