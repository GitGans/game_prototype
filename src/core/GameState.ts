import { BattleState, Phase, BattleMode } from '../battle/types';
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

  get(): BattleState {
    return this.state;
  }

  set(next: BattleState): void {
    this.state = next;
  }

  reset(): void {
    this.state = emptyState();
    this.battleMode = 'manual';
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
