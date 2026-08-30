import type { BattleRuntimeContext } from './battleRuntimeContext';

/**
 * The single mutable cell holding the active battle attempt.
 *
 * This module owns storage and nothing else: no phase check, no `sessionSource` validation,
 * no lifecycle rule, no field-specific setter. Those live in the two gateways above it —
 * `battleRuntimeAccess` (validated read) and `battleRuntimeWriteAccess` (complete install /
 * idempotent clear).
 *
 * Production imports are restricted to those two gateways by `RESTRICTED_IMPORT_TARGETS` in
 * scripts/orchestration-boundary-rules.mjs. Tests may import it directly, and only for:
 * fixture setup, cleanup, observation, and deliberately corrupted fixtures.
 */
let battleRuntime: BattleRuntimeContext | null = null;

export function readBattleRuntimeSlot(): BattleRuntimeContext | null {
  return battleRuntime;
}

/** Stores `next` by reference — identity is preserved, nothing is copied. */
export function writeBattleRuntimeSlot(next: BattleRuntimeContext): void {
  battleRuntime = next;
}

/** Idempotent: clearing an already-empty slot is a no-op, never an error. */
export function clearBattleRuntimeSlot(): void {
  battleRuntime = null;
}
