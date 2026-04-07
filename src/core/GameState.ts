import { BattleState, BattleMode, Phase, UnitRace } from '../battle/types';
import { buildOccupancy } from '../battle/occupancy';

function emptyState(): BattleState {
  return {
    units: new Map(),
    occupancy: buildOccupancy(new Map()),
    roundQueue: [],
    phase: 'placement',
    validTargets: [],
    benchUnits: [],
  };
}

class GameStateManager {
  private state: BattleState = emptyState();
  private battleMode: BattleMode = 'manual';

  // Survive reset() — shared across scene restarts
  playerUnitLevels: Record<string, number> = {};  // templateId → level
  lastEnemyRace: UnitRace | null = null;          // race from last battle (for Replay)

  get(): BattleState {
    return this.state;
  }

  set(next: BattleState): void {
    this.state = next;
  }

  reset(): void {
    this.state = emptyState();
    this.battleMode = 'manual';
    // playerUnitLevels and lastEnemyRace are intentionally NOT cleared here
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
}

export const GameState = new GameStateManager();
