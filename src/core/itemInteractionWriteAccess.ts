import type { PlayerSessionSource } from './playerSessionState';
import type { ItemInteraction } from '../shared/snapshotTypes';
import {
  writeItemInteractionSlot,
  clearItemInteractionSlot,
} from './itemInteractionStorage';

/**
 * The item-interaction WRITE capability: holding an import of this module *is* the authority to
 * open, advance or dispose an item interaction. Exactly one production module may import it — the phase
 * handler that owns the confirmation lifecycle — enforced by `RESTRICTED_IMPORT_TARGETS`.
 *
 * A separate module from `itemInteractionAccess` for one reason: the two have different
 * *importer* policies, and merging them would make that distinction unexpressible. It performs no
 * read, no phase inspection and no staleness rule; every write is scoped to one owning session.
 */
export function setItemInteraction(
  source: PlayerSessionSource,
  interaction: ItemInteraction,
): void {
  writeItemInteractionSlot(source, interaction);
}

/** Idempotent. Disposes only the named owner's interaction. */
export function clearItemInteraction(source: PlayerSessionSource): void {
  clearItemInteractionSlot(source);
}
