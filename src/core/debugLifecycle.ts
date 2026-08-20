import { GameState } from './GameState';
import { createDebugPlayerSession } from './debugPlayerSession';
import type { DebugSessionConfig } from './DebugBattleState';
import { PLAYER_UNITS } from '../data/units';
import { ITEM_CATALOG } from '../data/itemDefinitions';

/**
 * The single owner of debug-session *container* lifecycle: create, reset, dispose.
 * This is distinct from `PlayerSessionStore`, which mutates the *contents* of an
 * already-existing session (roster/inventory). This module never resolves a session
 * through `PlayerSessionStore` — it constructs or clears the `DebugBattleState` itself.
 *
 * `createDebugPlayerSession()` must remain a pure function of
 * (config, playerUnits, itemCatalog) — no RNG, no clock, no hidden `GameState` reads.
 * That purity is what makes "reset to initialConfig" a meaningful, reproducible operation.
 */

export function initializeDebugSession(config: DebugSessionConfig): void {
  const session = createDebugPlayerSession({ config, playerUnits: PLAYER_UNITS, itemCatalog: ITEM_CATALOG });
  GameState.setDebugState({ session, initialConfig: config });
}

export function resetDebugSession(): void {
  const { initialConfig } = GameState.requireDebugState();
  const session = createDebugPlayerSession({
    config: initialConfig,
    playerUnits: PLAYER_UNITS,
    itemCatalog: ITEM_CATALOG,
  });
  GameState.setDebugState({ session, initialConfig });
}

export function clearDebugSession(): void {
  GameState.clearDebugState();
}
