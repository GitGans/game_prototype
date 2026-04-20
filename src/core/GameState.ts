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
import { SubMapState } from '../world/types';
import { buildOccupancy } from "../battle/occupancy";

function emptyState(): BattleState {
  return {
    units: new Map(),
    occupancy: buildOccupancy(new Map()),
    roundQueue: [],
    phase: "placement",
    validTargets: [],
    benchUnits: [],
  };
}

export interface CampaignState {
  money: number;
  itemInstances: Record<string, ItemInstance>;
  itemContainers: Record<string, ItemContainer>;
  unitPermanentBonuses: Record<string, Partial<BattleStatBonuses>>;
  playerUnitLevels: Record<string, number>;
  playerUnitPlacements: Record<string, CellCoord>;
  playerBenchIds: string[] | null;
  campUnitIds: string[];
  subMapStates: Record<string, SubMapState>;
}

class GameStateManager {
  private state: BattleState = emptyState();
  private battleMode: BattleMode = "manual";

  // Survive reset() — shared across scene restarts
  playerUnitLevels: Record<string, number> = {}; // templateId → level
  lastEnemyRace: UnitRace | null = null; // race from last battle (for Replay)
  lastEnemyPlacements: Array<{ templateId: string; anchor: CellCoord; level: number }> | null = null; // enemy lineup snapshot for Restart Battle
  playerUnitPlacements: Record<string, CellCoord> = {}; // templateId → anchor, survives reset()
  playerBenchIds: string[] | null = null; // templateIds on bench; null = first battle, use defaults
  campUnitIds: string[] = []; // templateIds of units in camp (fully excluded from battle)
  itemInstances: Record<string, ItemInstance> = {}; // all item instances in the world
  itemContainers: Record<string, ItemContainer> = {}; // all item containers (backpacks, equipment slots)
  subMapStates: Record<string, SubMapState> = {}; // persists entity (mob) alive/dead state per submap
  money: number = 0;
  unitPermanentBonuses: Record<string, Partial<BattleStatBonuses>> = {};

  get(): BattleState {
    return this.state;
  }

  set(next: BattleState): void {
    this.state = next;
  }

  reset(): void {
    this.state = emptyState();
    this.battleMode = "manual";
    // playerUnitLevels, lastEnemyRace, lastEnemyPlacements are intentionally NOT cleared here
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
      unitPermanentBonuses: this.unitPermanentBonuses,
      playerUnitLevels: this.playerUnitLevels,
      playerUnitPlacements: this.playerUnitPlacements,
      playerBenchIds: this.playerBenchIds,
      campUnitIds: this.campUnitIds,
      subMapStates: this.subMapStates,
    };
  }
}

export const GameState = new GameStateManager();
