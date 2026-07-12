import {
  BattleState,
  BattleMode,
  Phase,
  UnitRace,
  CellCoord,
} from "../battle/types";
import {
  type TurnContext,
  createTurnContext,
  resetTurnContextForNewBattle,
} from '../battle/turnResolver';
import { BattleParticipant } from './phases';
import { buildOccupancy } from "../battle/occupancy";
import type { CampaignState } from '../campaign';
import type { DebugBattleState } from './DebugBattleState';
import type { PlayerSessionState } from './playerSessionState';
import type { RosterState } from '../progression';
import type { InventoryState } from '../inventory';

function emptyState(): BattleState {
  return {
    units:              new Map(),
    occupancy:          buildOccupancy(new Map(), new Map()),
    roundQueue:         [],
    phase:              'placement',
    validTargets:       [],
    nextPlayerId:       1,
    placementSelection: { selectedBenchUnitId: null, selectedFieldUnitId: null },
    previewTargetCoord: null,
    deployments:        new Map(),
    benchSlotCount:     0,
  };
}

class GameStateManager {
  private state: BattleState = emptyState();
  private battleMode: BattleMode = "manual";
  private battleTurnContext: TurnContext = createTurnContext();
  private campaignState: CampaignState | null = null;
  private debugState: DebugBattleState | null = null;

  // Survive reset() — shared across scene restarts
  lastEnemyRace: UnitRace | null = null;
  lastEnemyPlacements: Array<{ templateId: string; anchor: CellCoord; level: number }> | null = null;
  battleParticipants: BattleParticipant[] = [];

  get(): BattleState {
    return this.state;
  }

  set(next: BattleState): void {
    this.state = next;
  }

  reset(): void {
    this.state = emptyState();
    this.battleMode = "manual";
    this.battleTurnContext = resetTurnContextForNewBattle();
    // campaignState, debugState, lastEnemyRace, lastEnemyPlacements are intentionally NOT
    // cleared here — reset() only tears down battle runtime, not persistent/session state.
  }

  setPhase(phase: Phase): void {
    this.state = { ...this.state, phase };
  }

  getBattleMode(): BattleMode {
    return this.battleMode;
  }

  setBattleMode(mode: BattleMode): void {
    this.battleMode = mode;
  }

  getBattleTurnContext(): TurnContext {
    return this.battleTurnContext;
  }

  setBattleTurnContext(context: TurnContext): void {
    this.battleTurnContext = context;
  }

  resetBattleTurnContext(): void {
    this.battleTurnContext = resetTurnContextForNewBattle();
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

  setDebugState(next: DebugBattleState): void {
    this.debugState = next;
  }

  clearDebugState(): void {
    this.debugState = null;
  }

  /** @deprecated Migration bridge used only by the pre-Stage-7 battle-exit persistence path. Camp and upgrade no longer use this (Stage 3). Remove when Stage 7 migrates battle exit to PlayerSessionStore. */
  replaceDebugSession(next: PlayerSessionState): void {
    const ds = this.debugState;
    if (!ds) throw new Error('Debug state is not initialized');
    this.debugState = { ...ds, session: next };
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
