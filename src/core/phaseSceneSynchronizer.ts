import type { GamePhase } from './phases';

export interface PhaseSceneSynchronizer {
  sync(phase: GamePhase): void;
}
