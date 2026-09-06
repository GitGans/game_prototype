import { PlayerSessionStore } from '../playerSessionStore';
import type { PlayerSessionSource } from '../playerSessionState';
import type { GamePhase, PhaseAction } from '../phases';
import { PLAYER_UNITS } from '../../data/units';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { useConsumableItem } from '../consumableUse';
import { readPendingConsumeForPhase } from '../consumeConfirmationAccess';
import { setPendingConsume, clearPendingConsume } from '../consumeConfirmationWriteAccess';

/**
 * The domain owner for consumable use: the confirmation lifecycle plus the commit.
 *
 * It is the ONLY production module permitted to import `consumeConfirmationWriteAccess`, so
 * "who may open or dispose a confirmation" is answered by an import policy rather than by
 * convention. `phaseActionEffects` dispatches here and performs no write itself, which is what
 * keeps its documented contract — "owns no mutation itself" — literally true.
 */

export type ConsumablePhaseAction = Extract<PhaseAction, { type: 'confirm_consume_item' }>;

/**
 * `request_consume_item`. The target is always the character selected on the equip screen the
 * action came from — never one chosen by the caller — and the request is filed under that
 * screen's own session.
 */
export function openConsumeConfirmation(input: {
  source: PlayerSessionSource;
  instanceId: string;
  unitTemplateId: string;
}): void {
  setPendingConsume(input.source, {
    instanceId: input.instanceId,
    unitTemplateId: input.unitTemplateId,
  });
}

/** `cancel_consume_item` and session-lifecycle disposal. Idempotent, scoped to one owner. */
export function clearConsumeConfirmationIfPresent(source: PlayerSessionSource): void {
  clearPendingConsume(source);
}

/**
 * Structural disposal after a transition: the equipment screen was left, or its selected
 * character changed. Takes BOTH phases, exactly like `teardownBattleRuntimeAfterTransition`.
 *
 * The owner comes from the PREVIOUS phase because the resolved one often cannot supply it —
 * `main_menu`, `debug_level_select` and `world_map` carry no `sessionSource` at all.
 *
 * And the disposal is an unconditional, idempotent clear of that owner's slot, never a filtered
 * read first: `readPendingConsumeForPhase` returns null in precisely these situations (screen
 * left, character changed), so a teardown built on it would leave the stale request in storage to
 * reappear on returning to that character.
 */
export function teardownConsumeConfirmationAfterTransition(
  previousPhase: GamePhase,
  resolvedPhase: GamePhase,
): void {
  // Only an equip screen can have opened a confirmation, and only it names the owner.
  if (previousPhase.type !== 'equip_screen' && previousPhase.type !== 'debug_equip_screen') return;
  const source = previousPhase.sessionSource;

  const stillOnSameScreen =
    (resolvedPhase.type === 'equip_screen' || resolvedPhase.type === 'debug_equip_screen') &&
    resolvedPhase.sessionSource === source &&
    resolvedPhase.selectedUnitTemplateId === previousPhase.selectedUnitTemplateId;

  if (!stillOnSameScreen) clearPendingConsume(source);
}

/**
 * `confirm_consume_item`. The equip phase the action was accepted from is the SOLE source of
 * session ownership: it names the owner, validates the stored request, and selects the storage
 * tree that is written. There is deliberately no separate `source` parameter — two independent
 * descriptions of one owner would let a caller validate a campaign request and commit a debug
 * one, and no confirm-time check could tell the two apart (`instanceId`/`unitTemplateId` prove
 * nothing about ownership: a debug reset recreates the *same* authored instance ids).
 *
 * Re-checks ownership against the stored request, then commits against the CURRENT authoritative
 * session — a vanished item, a now-dead target or any other change leaves both domains
 * untouched. Roster and inventory are written together, never separately.
 */
export function applyConsumablePhaseAction(input: {
  /** The equip phase the action was accepted from: names the owner and validates the request. */
  previousPhase: GamePhase;
  action: ConsumablePhaseAction;
}): void {
  const { previousPhase, action } = input;

  // Narrowing, not a routing decision: only an equip screen can have opened a confirmation, and
  // only it names the owner. Same shape as `teardownConsumeConfirmationAfterTransition`. The
  // facade still throws on this case — an accepted action arriving with an inconsistent phase is
  // lifecycle corruption; here it is the type-level precondition for reading `sessionSource`, and
  // it makes the exported operation safe when invoked on its own.
  if (previousPhase.type !== 'equip_screen' && previousPhase.type !== 'debug_equip_screen') return;
  const source = previousPhase.sessionSource;

  const pending = readPendingConsumeForPhase(previousPhase);
  if (pending === null) return;
  if (pending.instanceId !== action.instanceId) return;
  if (pending.unitTemplateId !== action.unitTemplateId) return;

  // Cleared before the attempt: a confirmation never survives its own confirm, commit or not.
  clearPendingConsume(source);

  const session = PlayerSessionStore.getSession(source);
  const result = useConsumableItem({
    session,
    catalog: ITEM_CATALOG,
    playerBlueprints: PLAYER_UNITS,
    unitTemplateId: action.unitTemplateId,
    instanceId: action.instanceId,
  });
  if (!result.ok) return; // silent no-op, exactly like equip/unequip

  PlayerSessionStore.replaceSession(source, result.nextSession);
}
