import {
  BattleState,
  BattleMode,
  Phase,
  UnitRace,
  CellCoord,
  ItemInstance,
  ItemContainer,
  BattleStatBonuses,
} from "../battle/types";
import { BattleParticipant } from './phases';
import { SubMapState } from '../world/types';
import { buildOccupancy } from "../battle/occupancy";

function emptyState(): BattleState {
  return {
    units:              new Map(),
    occupancy:          buildOccupancy(new Map()),
    roundQueue:         [],
    phase:              'placement',
    validTargets:       [],
    benchUnits:         [],
    nextPlayerId:       1,
    placementSelection: { selectedBenchIdx: null, selectedFieldUnitId: null },
  };
}

export interface PlayerUnitState {
  level: number;
  isInCamp: boolean;
  lastPlacement: CellCoord | null;
  permanentBonuses: Partial<BattleStatBonuses>;
  chosenUpgrades: Partial<Record<5 | 10 | 15 | 20, string>>; // upgrade id per tier
}

export interface CampaignState {
  money: number;
  itemInstances: Record<string, ItemInstance>;
  itemContainers: Record<string, ItemContainer>;
  playerUnits: Record<string, PlayerUnitState>; // templateId → state
  subMapStates: Record<string, SubMapState>;
}

class GameStateManager {
  private state: BattleState = emptyState();
  private battleMode: BattleMode = "manual";

  // Survive reset() — shared across scene restarts
  lastEnemyRace: UnitRace | null = null;
  lastEnemyPlacements: Array<{ templateId: string; anchor: CellCoord; level: number }> | null = null;
  battleParticipants: BattleParticipant[] = [];
  playerUnits: Record<string, PlayerUnitState> = {};
  itemInstances: Record<string, ItemInstance> = {};
  itemContainers: Record<string, ItemContainer> = {};
  subMapStates: Record<string, SubMapState> = {};
  money: number = 0;

  get(): BattleState {
    return this.state;
  }

  set(next: BattleState): void {
    this.state = next;
  }

  reset(): void {
    this.state = emptyState();
    this.battleMode = "manual";
    // playerUnits, lastEnemyRace, lastEnemyPlacements are intentionally NOT cleared here
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

  get campaign(): CampaignState {
    return {
      money: this.money,
      itemInstances: this.itemInstances,
      itemContainers: this.itemContainers,
      playerUnits: this.playerUnits,
      subMapStates: this.subMapStates,
    };
  }
}

export const GameState = new GameStateManager();
