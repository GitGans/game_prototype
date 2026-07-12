import type { PlayerSessionSource } from './playerSessionState';
import type { DebugBattleState } from './DebugBattleState';

export type BattleExitRoute =
  | { source: 'debug'; debugState: DebugBattleState }
  | { source: 'campaign' };

/**
 * Decides which battle-exit persistence branch applies. Never returns a
 * 'debug' route without a real DebugBattleState — a debug-sourced runtime
 * with no matching debug storage is a lifecycle error, not a reason to fall
 * back to campaign persistence.
 */
export function resolveBattleExitRoute(
  sessionSource: PlayerSessionSource,
  debugState: DebugBattleState | null,
): BattleExitRoute {
  if (sessionSource === 'debug') {
    if (!debugState) throw new Error('Debug state is not initialized');
    return { source: 'debug', debugState };
  }
  return { source: 'campaign' };
}
