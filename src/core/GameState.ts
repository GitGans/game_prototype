import type { CampaignState } from '../campaign';
import type { DebugBattleState } from './DebugBattleState';
import type { RosterState } from '../progression';
import type { InventoryState } from '../inventory';
import type { BattleState, BattleMode } from '../battle/types';
import type { TurnContext } from '../battle/turnResolver';
import type { BattleRuntimeContext, AutoTurnIntention } from './battleRuntimeContext';

class GameStateManager {
  private battleRuntime: BattleRuntimeContext | null = null;
  private campaignState: CampaignState | null = null;
  private debugState: DebugBattleState | null = null;

  hasBattleRuntime(): boolean {
    return this.battleRuntime !== null;
  }

  getBattleRuntime(): BattleRuntimeContext {
    if (!this.battleRuntime) throw new Error('Battle runtime is not initialized');
    return this.battleRuntime;
  }

  setBattleRuntime(next: BattleRuntimeContext): void {
    this.battleRuntime = next;
  }

  resetBattleRuntime(): void {
    this.battleRuntime = null;
  }

  replaceBattleState(next: BattleState): void {
    this.battleRuntime = { ...this.getBattleRuntime(), state: next };
  }

  replaceBattleMode(next: BattleMode): void {
    this.battleRuntime = { ...this.getBattleRuntime(), mode: next };
  }

  replaceBattleTurnContext(next: TurnContext): void {
    this.battleRuntime = { ...this.getBattleRuntime(), turnContext: next };
  }

  replacePendingAutoTurnIntention(next: AutoTurnIntention | null): void {
    this.battleRuntime = { ...this.getBattleRuntime(), pendingAutoTurnIntention: next };
  }

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
