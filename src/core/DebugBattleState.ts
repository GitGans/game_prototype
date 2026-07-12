import type { StartingItemDefinition } from '../data/startingInventoryDefinitions';
import type { PlayerSessionState } from './playerSessionState';

export interface DebugSessionConfig {
  readonly level: number;
  readonly startingItems: readonly StartingItemDefinition[];
  readonly initialCampUnitIds: readonly string[];
}

export interface DebugBattleState {
  session: PlayerSessionState;
  initialConfig: DebugSessionConfig;
}
