import { PlayerSessionStore } from '../playerSessionStore';
import type { PlayerSessionSource } from '../playerSessionState';
import type { GamePhase, PhaseAction } from '../phases';
import type { ItemUseOrigin } from '../../shared/snapshotTypes';
import { PLAYER_UNITS } from '../../data/units';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { useItem } from '../itemUse';
import { readItemInteractionForPhase } from '../itemInteractionAccess';
import { setItemInteraction, clearItemInteraction } from '../itemInteractionWriteAccess';

/**
 * The domain owner for item use: the interaction lifecycle (`closed | confirming_use`) plus the
 * commit.
 *
 * It is the ONLY production module permitted to import `itemInteractionWriteAccess`, so
 * "who may open or dispose an interaction" is answered by an import policy rather than
 * by convention. `phaseActionEffects` dispatches here and performs no write itself, which is what
 * keeps its documented contract — "owns no mutation itself" — literally true.
 */

export type ItemUsePhaseAction = Extract<PhaseAction, { type: 'confirm_use_item' }>;

type EquipPhase = Extract<GamePhase, { type: 'equip_screen' | 'debug_equip_screen' }>;

/** Only an equip screen can hold an interaction, and only it names the owner. */
function asEquipPhase(phase: GamePhase): EquipPhase | null {
  if (phase.type !== 'equip_screen' && phase.type !== 'debug_equip_screen') return null;
  return phase;
}

/**
 * `request_use_item`. The target is always the character selected on the equip screen the action
 * came from — never one chosen by the caller — and the interaction is filed under that screen's own
 * session.
 *
 * The ORIGIN is recorded with it, because it is what consumption must later validate against: the
 * same instance is a different request from the backpack and from `usable_slot`, and by commit time
 * the item may have moved.
 */
export function beginItemUseConfirmation(input: {
  source: PlayerSessionSource;
  instanceId: string;
  unitTemplateId: string;
  origin: ItemUseOrigin;
}): void {
  setItemInteraction(input.source, {
    kind: 'confirming_use',
    instanceId: input.instanceId,
    unitTemplateId: input.unitTemplateId,
    origin: input.origin,
  });
}

/** `cancel_use_item` and session-lifecycle disposal. Idempotent, scoped to one owner. */
export function clearItemInteractionIfPresent(source: PlayerSessionSource): void {
  clearItemInteraction(source);
}

/**
 * Structural disposal after a transition: the equipment screen was left, or its selected
 * character changed. Takes BOTH phases, exactly like `teardownBattleRuntimeAfterTransition`.
 *
 * The owner comes from the PREVIOUS phase because the resolved one often cannot supply it —
 * `main_menu`, `debug_level_select` and `world_map` carry no `sessionSource` at all.
 *
 * And the disposal is an unconditional, idempotent clear of that owner's slot, never a filtered
 * read first: `readItemInteractionForPhase` returns null in precisely these situations (screen
 * left, character changed), so a teardown built on it would leave the stale interaction in
 * storage to reappear on returning to that character.
 */
export function teardownItemInteractionAfterTransition(
  previousPhase: GamePhase,
  resolvedPhase: GamePhase,
): void {
  const previous = asEquipPhase(previousPhase);
  if (!previous) return;
  const source = previous.sessionSource;

  const resolved = asEquipPhase(resolvedPhase);
  const stillOnSameScreen =
    resolved !== null &&
    resolved.sessionSource === source &&
    resolved.selectedUnitTemplateId === previous.selectedUnitTemplateId;

  if (!stillOnSameScreen) clearItemInteraction(source);
}

/**
 * `confirm_use_item`. The equip phase the action was accepted from is the SOLE source of
 * session ownership: it names the owner, validates the stored interaction, and selects the
 * storage tree that is written. There is deliberately no separate `source` parameter — two
 * independent descriptions of one owner would let a caller validate a campaign request and commit
 * a debug one, and no confirm-time check could tell the two apart (`instanceId`/`unitTemplateId`
 * prove nothing about ownership: a debug reset recreates the *same* authored instance ids).
 *
 * Re-checks ownership against the stored interaction, then commits against the CURRENT
 * authoritative session — a vanished item, a now-dead target or any other change leaves both
 * domains untouched. Roster and inventory are written together, never separately.
 */
export function applyItemUsePhaseAction(input: {
  /** The equip phase the action was accepted from: names the owner and validates the request. */
  previousPhase: GamePhase;
  action: ItemUsePhaseAction;
}): void {
  const previous = asEquipPhase(input.previousPhase);
  // Narrowing, not a routing decision. The facade still throws on this case — an accepted action
  // arriving with an inconsistent phase is lifecycle corruption; here it is the type-level
  // precondition for reading `sessionSource`, and it makes the exported operation safe when
  // invoked on its own.
  if (!previous) return;
  const source = previous.sessionSource;
  const { action } = input;

  const interaction = readItemInteractionForPhase(previous);
  if (interaction === null) return;
  if (interaction.kind !== 'confirming_use') return;
  if (interaction.instanceId !== action.instanceId) return;
  if (interaction.unitTemplateId !== action.unitTemplateId) return;

  // Cleared before the attempt: a confirmation never survives its own confirm, commit or not.
  clearItemInteraction(source);

  const session = PlayerSessionStore.getSession(source);
  const result = useItem({
    session,
    catalog: ITEM_CATALOG,
    playerBlueprints: PLAYER_UNITS,
    unitTemplateId: action.unitTemplateId,
    instanceId: action.instanceId,
    // From STORAGE, never from the action: the origin the confirmation was opened for is the origin
    // consumption must validate against. An item that moved between the backpack and `usable_slot`
    // since then fails that validation and leaves both domains untouched, which is the point.
    origin: interaction.origin,
  });
  if (!result.ok) return; // silent no-op, exactly like equip/unequip

  PlayerSessionStore.replaceSession(source, result.nextSession);
}
