import type { Effect } from './skillTypes';

export interface ActiveEffect {
  effectDisplayName: string;
  effect: Effect;
  remainingRounds: number;
  computedPerTurn?: number;
}
