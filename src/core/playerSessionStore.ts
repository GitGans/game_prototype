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

  /**
   * Replaces roster and inventory together, in one enclosing state replacement.
   *
   * Needed by operations that change both domains at once (consumable use): two sequential
   * `replaceRoster` + `replaceInventory` calls would publish an intermediate state in which the
   * bonus is granted but the item still exists. Everything outside the session — campaign world
   * and money, debug `initialConfig` — is preserved verbatim.
   */
  replaceSession(source: PlayerSessionSource, next: PlayerSessionState): void {
    if (source === 'campaign') {
      const campaign = GameState.getCampaignState();
      GameState.setCampaignState({ ...campaign, roster: next.roster, inventory: next.inventory });
      return;
    }
    const debugState = GameState.getDebugState();
    if (!debugState) throw new Error('Debug state is not initialized');
    GameState.setDebugState({ ...debugState, session: next });
  },
};
