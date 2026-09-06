import type { PendingConsumeRequest } from '../shared/snapshotTypes';
import type { PlayerSessionSource } from './playerSessionState';

/**
 * The pending-confirmation cells and NOTHING else: no phase check, no ownership rule, no
 * lifecycle sequencing, no staleness logic. Exactly three exports, pinned in
 * `RUNTIME_OWNERSHIP_EXPORT_POLICIES`.
 *
 * Modelled on `battleRuntimeStorage.ts`, including the importer restriction: in production only
 * `consumeConfirmationAccess.ts` and `consumeConfirmationWriteAccess.ts` may import this module,
 * because an outbound allowlist cannot express "who may pick up this authority".
 *
 * ── Ownership ───────────────────────────────────────────────────────────────────────────────
 * Storage is keyed by `PlayerSessionSource`, not a single global cell. `BattleRuntimeContext`
 * carries `sessionSource` and `requireBattleRuntimeForPhase` asserts it; the same guarantee is
 * needed here, because `instanceId`/`unitTemplateId` prove nothing about ownership — resetting a
 * debug session recreates the *same* authored instance ids. Keying by session means a campaign
 * transition can never read, confirm or dispose a debug request.
 *
 * Two managers on the SAME session still share a slot, exactly as they already share the whole of
 * `GameState`. Isolation here is as strong as the surrounding architecture, and no stronger.
 */
const slots: Record<PlayerSessionSource, PendingConsumeRequest | null> = {
  campaign: null,
  debug: null,
};

export function readConsumeConfirmationSlot(
  source: PlayerSessionSource,
): PendingConsumeRequest | null {
  const slot = slots[source];
  // Defensive copy. A `get`-only surface is not read-only on its own: handing out the stored
  // object would let a reader reassign its fields without going through the write gateway.
  return slot === null ? null : { ...slot };
}

export function writeConsumeConfirmationSlot(
  source: PlayerSessionSource,
  next: PendingConsumeRequest,
): void {
  slots[source] = { instanceId: next.instanceId, unitTemplateId: next.unitTemplateId };
}

/** Idempotent. */
export function clearConsumeConfirmationSlot(source: PlayerSessionSource): void {
  slots[source] = null;
}
