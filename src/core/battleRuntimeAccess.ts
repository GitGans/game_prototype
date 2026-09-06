import type { GamePhase } from './phases';
import type { BattleRuntimeContext } from './battleRuntimeContext';
import { readBattleRuntimeSlot } from './battleRuntimeStorage';

/**
 * The single seam that resolves the active battle runtime for a battle phase, and the ONLY
 * production read path — there is no unvalidated getter anywhere.
 *
 * `runtime.sessionSource` must always equal the phase's `sessionSource`. A mismatch is a
 * lifecycle error, never a fallback to the other storage tree — see the session-isolation
 * invariant in src/core/CLAUDE.md.
 *
 * Read-only by responsibility: this module exposes exactly this lookup. Runtime installation
 * and teardown belong to `battleRuntimeWriteAccess`, the write capability.
 */
export function requireBattleRuntimeForPhase(
  phase: Extract<GamePhase, { type: 'battle' }>,
): BattleRuntimeContext {
  const runtime = readBattleRuntimeSlot();
  if (!runtime) throw new Error('Battle runtime is not initialized');

  if (runtime.sessionSource !== phase.sessionSource) {
    throw new Error(
      `Battle runtime/phase sessionSource mismatch: runtime="${runtime.sessionSource}", phase="${phase.sessionSource}"`,
    );
  }
  return runtime;
}
