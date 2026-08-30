import type { CampaignState } from '../campaign';
import type { DebugBattleState } from './DebugBattleState';
import type { RosterState } from '../progression';
import type { InventoryState } from '../inventory';

/**
 * Campaign and debug persistent containers. NOT the battle runtime — the active battle attempt
 * lives in `battleRuntimeStorage` behind its read/write gateways, so no module gains the ability
 * to replace a battle attempt merely by importing GameState.
 *
 * Both surfaces are closed policies, not incidental properties of this file: `GAME_STATE_FIELDS`
 * pins what it stores and `GAME_STATE_PUBLIC_API` pins what it exposes
 * (scripts/orchestration-boundary-rules.mjs).
 */
class GameStateManager {
  private campaignState: CampaignState | null = null;
  private debugState: DebugBattleState | null = null;

  hasCampaignState(): boolean {
    return this.campaignState !== null;
  }

  getCampaignState(): CampaignState {
    if (!this.campaignState) throw new Error('Campaign state is not initialized');
    return this.campaignState;
  }

  setCampaignState(next: CampaignState): void {
    this.campaignState = next;
  }

  replaceCampaignRoster(next: RosterState): void {
    this.setCampaignState({ ...this.getCampaignState(), roster: next });
  }

  replaceCampaignInventory(next: InventoryState): void {
    this.setCampaignState({ ...this.getCampaignState(), inventory: next });
  }

  getDebugState(): DebugBattleState | null {
    return this.debugState;
  }

  requireDebugState(): DebugBattleState {
    if (!this.debugState) {
      throw new Error('Debug state is not initialized');
    }
    return this.debugState;
  }

  setDebugState(next: DebugBattleState): void {
    this.debugState = next;
  }

  clearDebugState(): void {
    this.debugState = null;
  }

  replaceDebugRoster(next: RosterState): void {
    const ds = this.debugState;
    if (!ds) throw new Error('Debug state is not initialized');
    this.debugState = { ...ds, session: { ...ds.session, roster: next } };
  }

  replaceDebugInventory(next: InventoryState): void {
    const ds = this.debugState;
    if (!ds) throw new Error('Debug state is not initialized');
    this.debugState = { ...ds, session: { ...ds.session, inventory: next } };
  }
}

export const GameState = new GameStateManager();
