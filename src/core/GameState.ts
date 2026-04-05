import { BattleState, Phase } from '../battle/types';
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

  get(): BattleState {
    return this.state;
  }

  set(next: BattleState): void {
    this.state = next;
  }

  reset(): void {
    this.state = emptyState();
  }

  setPhase(phase: Phase): void {
    this.state = { ...this.state, phase };
  }
}

export const GameState = new GameStateManager();
