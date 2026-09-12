import type { ItemInteraction } from '../shared/snapshotTypes';
import type { PlayerSessionSource } from './playerSessionState';

/**
 * The item-interaction cells and NOTHING else: no phase check, no ownership rule, no lifecycle
 * sequencing, no staleness logic. Exactly four exports, pinned in
 * `RUNTIME_OWNERSHIP_EXPORT_POLICIES`.
 *
 * Modelled on `battleRuntimeStorage.ts`, including the importer restriction: in production only
 * `itemInteractionAccess.ts` and `itemInteractionWriteAccess.ts` may import this module, because
 * an outbound allowlist cannot express "who may pick up this authority".
 *
 * ── The state machine ───────────────────────────────────────────────────────────────────────
 * `closed | choosing_action | confirming_use` (`ItemInteraction`, declared in
 * `shared/snapshotTypes.ts`), where `closed` is the `null` slot. Both open
 * states record the instance and the character they target. Only ONE can be stored per session,
 * which is what makes "at most one modal is open" a storage property rather than a UI rule.
 *
 * ── Ownership ───────────────────────────────────────────────────────────────────────────────
 * Storage is keyed by `PlayerSessionSource`, not a single global cell. `BattleRuntimeContext`
 * carries `sessionSource` and `requireBattleRuntimeForPhase` asserts it; the same guarantee is
 * needed here, because `instanceId`/`unitTemplateId` prove nothing about ownership — resetting a
 * debug session recreates the *same* authored instance ids. Keying by session means a campaign
 * transition can never read, select, confirm or dispose a debug interaction.
 *
 * Two managers on the SAME session still share a slot, exactly as they already share the whole of
 * `GameState`. Isolation here is as strong as the surrounding architecture, and no stronger.
 */
const slots: Record<PlayerSessionSource, ItemInteraction | null> = {
  campaign: null,
  debug: null,
};

export function readItemInteractionSlot(
  source: PlayerSessionSource,
): ItemInteraction | null {
  const slot = slots[source];
  // Defensive copy. A `get`-only surface is not read-only on its own: handing out the stored
  // object would let a reader reassign its fields without going through the write gateway.
  return slot === null ? null : { ...slot };
}

export function writeItemInteractionSlot(
  source: PlayerSessionSource,
  next: ItemInteraction,
): void {
  slots[source] = {
    kind: next.kind,
    instanceId: next.instanceId,
    unitTemplateId: next.unitTemplateId,
  };
}

/** Idempotent. */
export function clearItemInteractionSlot(source: PlayerSessionSource): void {
  slots[source] = null;
}
