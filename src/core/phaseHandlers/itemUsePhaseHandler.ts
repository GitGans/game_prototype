import { PlayerSessionStore } from '../playerSessionStore';
import type { PlayerSessionSource } from '../playerSessionState';
import type { GamePhase, PhaseAction } from '../phases';
import type { ItemEffectPreview, ItemUseOrigin } from '../../shared/snapshotTypes';
import { PLAYER_UNITS } from '../../data/units';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { useItem, useResurrectionItem } from '../itemUse';
import { evaluateItemUse } from '../itemUsability';
import { readItemInteractionForPhase } from '../itemInteractionAccess';
import { setItemInteraction, clearItemInteraction } from '../itemInteractionWriteAccess';

/**
 * The domain owner for item use: the interaction lifecycle
 * (`closed | confirming_use | selecting_revive_target`) plus the commit.
 *
 * It is the ONLY production module permitted to import `itemInteractionWriteAccess`, so
 * "who may open or dispose an interaction" is answered by an import policy rather than
 * by convention. `phaseActionEffects` dispatches here and performs no write itself, which is what
 * keeps its documented contract — "owns no mutation itself" — literally true.
 *
 * It holds the executor for the COMMIT, which re-validates by attempting the use, and the read
 * model for exactly one other responsibility: deciding whether an OPEN interaction is still
 * justified, and disposing it if not. The snapshot projection can only HIDE an unjustifiable
 * request — a hidden interaction that becomes valid again would reappear with no new use request —
 * and disposal needs the write capability, which lives here alone. Calling the evaluator is reuse;
 * no eligibility rule is restated here.
 */

export type ItemUsePhaseAction = Extract<
  PhaseAction,
  { type: 'confirm_use_item' | 'select_item_revive_target' }
>;

type EquipPhase = Extract<GamePhase, { type: 'equip_screen' | 'debug_equip_screen' }>;

/** Only an equip screen can hold an interaction, and only it names the owner. */
function asEquipPhase(phase: GamePhase): EquipPhase | null {
  if (phase.type !== 'equip_screen' && phase.type !== 'debug_equip_screen') return null;
  return phase;
}

/**
 * `request_use_item`. The INITIATOR is always the character selected on the equip screen the action
 * came from — never one chosen by the caller — and the interaction is filed under that screen's own
 * session.
 *
 * The ORIGIN is recorded with it, because it is what consumption must later validate against: the
 * same instance is a different request from the backpack and from `usable_slot`, and by commit time
 * the item may have moved.
 *
 * WHICH interaction opens follows the effect of the usability entry the resolver just accepted —
 * committed snapshot data, produced by the same evaluator the commit re-runs, one step earlier in
 * the same pipeline call. The effect → interaction mapping lives here, in the domain owner; the
 * dispatcher only forwards the verdict, exactly as it already forwards the origin.
 */
export function beginItemUseInteraction(input: {
  source: PlayerSessionSource;
  instanceId: string;
  unitTemplateId: string;
  origin: ItemUseOrigin;
  effectKind: ItemEffectPreview['type'];
}): void {
  setItemInteraction(input.source, {
    // A revive names no implied target, so it opens selection; everything else acts on the
    // initiator and opens a confirmation.
    kind: input.effectKind === 'revive' ? 'selecting_revive_target' : 'confirming_use',
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
 *
 * Staying on the same screen is not the end of the question. Structural teardown answers "did we
 * leave?"; it cannot answer "is this open request still justified?" — so when we stayed, the
 * interaction is reconciled against the current session instead.
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

  if (!stillOnSameScreen) {
    clearItemInteraction(source);
    return;
  }
  reconcileItemInteraction(resolved);
}

/**
 * Disposes an open interaction the CURRENT session can no longer justify: the item was consumed or
 * moved between the backpack and `usable_slot`, the initiator died or entered camp, the effect is
 * no longer the one the interaction was opened for, or the last eligible resurrection target left
 * the party.
 *
 * This is a LIFECYCLE decision — should a stored request continue to exist — not a commit. Commit
 * validation stays in the executor, which re-validates by attempting the use, so no rule is
 * duplicated: the evaluator is CALLED here, never restated.
 *
 * Disposal rather than omission is the point. The snapshot projection already hides an
 * unjustifiable interaction, but hiding is not disposal: a hidden request whose conditions come
 * back would render again without the player ever asking to use the item a second time.
 */
function reconcileItemInteraction(phase: EquipPhase): void {
  const interaction = readItemInteractionForPhase(phase);
  if (interaction === null) return;

  const evaluation = evaluateItemUse({
    session: PlayerSessionStore.getSession(phase.sessionSource),
    catalog: ITEM_CATALOG,
    playerBlueprints: PLAYER_UNITS,
    // Both from STORAGE: the initiator the request was filed for, and the location it was admitted
    // for — never re-derived from where the item happens to sit now.
    unitTemplateId: interaction.unitTemplateId,
    instanceId: interaction.instanceId,
    origin: interaction.origin,
  });

  // A `selecting_revive_target` over a healing potion — or the reverse — is as stale as a vanished
  // item: the modal on screen would not be the one this request is about.
  const stillJustified =
    evaluation.ok &&
    (evaluation.effect.type === 'revive') === (interaction.kind === 'selecting_revive_target');

  if (!stillJustified) clearItemInteraction(phase.sessionSource);
}

/**
 * `confirm_use_item` and `select_item_revive_target`. The equip phase the action was accepted from
 * is the SOLE source of
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
  if (interaction.instanceId !== action.instanceId) return;

  if (action.type === 'confirm_use_item') {
    if (interaction.kind !== 'confirming_use') return;
    if (interaction.unitTemplateId !== action.unitTemplateId) return;

    // Cleared before the attempt: a confirmation never survives its own confirm, commit or not.
    clearItemInteraction(source);

    const result = useItem({
      session: PlayerSessionStore.getSession(source),
      catalog: ITEM_CATALOG,
      playerBlueprints: PLAYER_UNITS,
      unitTemplateId: action.unitTemplateId,
      instanceId: action.instanceId,
      // From STORAGE, never from the action: the origin the confirmation was opened for is the
      // origin consumption must validate against. An item that moved between the backpack and
      // `usable_slot` since then fails that validation and leaves both domains untouched.
      origin: interaction.origin,
    });
    if (!result.ok) return; // silent no-op, exactly like equip/unequip

    PlayerSessionStore.replaceSession(source, result.nextSession);
    return;
  }

  if (interaction.kind !== 'selecting_revive_target') return;

  // Same rule, one more participant: the INITIATOR comes from storage (and was already matched
  // against this screen's selected character by the read gateway), the origin comes from storage,
  // and the action contributes only the chosen TARGET — which the executor resolves against its own
  // freshly evaluated eligible set.
  clearItemInteraction(source);

  const result = useResurrectionItem({
    session: PlayerSessionStore.getSession(source),
    catalog: ITEM_CATALOG,
    playerBlueprints: PLAYER_UNITS,
    unitTemplateId: interaction.unitTemplateId,
    instanceId: action.instanceId,
    origin: interaction.origin,
    targetUnitTemplateId: action.targetUnitTemplateId,
  });
  if (!result.ok) return; // silent no-op; roster and inventory both untouched

  // One write for both domains: the target is alive and the scroll is gone, or neither happened.
  PlayerSessionStore.replaceSession(source, result.nextSession);
}
