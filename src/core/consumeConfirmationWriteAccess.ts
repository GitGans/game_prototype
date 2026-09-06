import type { PendingConsumeRequest } from '../shared/snapshotTypes';
import type { PlayerSessionSource } from './playerSessionState';
import {
  writeConsumeConfirmationSlot,
  clearConsumeConfirmationSlot,
} from './consumeConfirmationStorage';

/**
 * The confirmation WRITE capability: holding an import of this module *is* the authority to open
 * or dispose a pending confirmation. Exactly one production module may import it — the phase
 * handler that owns the confirmation lifecycle — enforced by `RESTRICTED_IMPORT_TARGETS`.
 *
 * A separate module from `consumeConfirmationAccess` for one reason: the two have different
 * *importer* policies, and merging them would make that distinction unexpressible. It performs no
 * read, no phase inspection and no staleness rule; every write is scoped to one owning session.
 */
export function setPendingConsume(
  source: PlayerSessionSource,
  request: PendingConsumeRequest,
): void {
  writeConsumeConfirmationSlot(source, request);
}

/** Idempotent. Disposes only the named owner's request. */
export function clearPendingConsume(source: PlayerSessionSource): void {
  clearConsumeConfirmationSlot(source);
}
