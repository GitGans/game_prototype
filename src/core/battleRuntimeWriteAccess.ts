import type { BattleRuntimeContext } from './battleRuntimeContext';
import { writeBattleRuntimeSlot, clearBattleRuntimeSlot } from './battleRuntimeStorage';

/**
 * The battle-runtime WRITE CAPABILITY. Holding an import of this module is the authority to
 * replace or dispose the active battle attempt, so exactly one production module may import
 * it — `battlePhaseEffects`, the lifecycle owner. Enforced by `RESTRICTED_IMPORT_TARGETS`.
 *
 * Complete replacement only. There is deliberately no partial setter: every caller resolves
 * the current runtime, computes a whole replacement, and installs it in one write, so no
 * action can leave the runtime half-updated between two writes.
 *
 * Performs no read, no validation, no phase inspection, no lifecycle decision and no battle
 * calculation.
 */
export function installBattleRuntime(next: BattleRuntimeContext): void {
  writeBattleRuntimeSlot(next);
}

/** Idempotent — safe to call from a phase that may or may not have a runtime installed. */
export function clearBattleRuntime(): void {
  clearBattleRuntimeSlot();
}
