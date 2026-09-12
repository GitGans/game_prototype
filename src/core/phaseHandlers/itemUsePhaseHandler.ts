import { PlayerSessionStore } from '../playerSessionStore';
import type { PlayerSessionSource } from '../playerSessionState';
import type { GamePhase, PhaseAction } from '../phases';
import type { ItemActionKind } from '../../shared/snapshotTypes';
import { PLAYER_UNITS } from '../../data/units';
import { ITEM_CATALOG } from '../../data/itemDefinitions';
import { useItem } from '../itemUse';
import { evaluateItemUsability } from '../itemUsability';
import { evaluateEquipItem } from '../../inventory';
import { resolveUnitProgression } from '../../progression';
import { readItemInteractionForPhase } from '../itemInteractionAccess';
import { setItemInteraction, clearItemInteraction } from '../itemInteractionWriteAccess';
import { applyEquipmentPhaseAction } from './inventoryPhaseHandler';

/**
 * The domain owner for item use: the interaction lifecycle (`closed | choosing_action |
 * confirming_use`) plus the commit.
 *
 * It is the ONLY production module permitted to import `itemInteractionWriteAccess`, so
 * "who may open, advance or dispose an interaction" is answered by an import policy rather than
 * by convention. `phaseActionEffects` dispatches here and performs no write itself, which is what
 * keeps its documented contract — "owns no mutation itself" — literally true.
 */

export type ItemUsePhaseAction = Extract<PhaseAction, { type: 'confirm_use_item' }>;
export type ItemActionSelection = Extract<PhaseAction, { type: 'select_item_action' }>;

type EquipPhase = Extract<GamePhase, { type: 'equip_screen' | 'debug_equip_screen' }>;

/** Only an equip screen can hold an interaction, and only it names the owner. */
function asEquipPhase(phase: GamePhase): EquipPhase | null {
  if (phase.type !== 'equip_screen' && phase.type !== 'debug_equip_screen') return null;
  return phase;
}

/**
 * `open_item_actions`. The target is always the character selected on the equip screen the
 * action came from — never one chosen by the caller — and the interaction is filed under that
 * screen's own session.
 */
export function openItemActions(input: {
  source: PlayerSessionSource;
  instanceId: string;
  unitTemplateId: string;
}): void {
  setItemInteraction(input.source, {
    kind: 'choosing_action',
    instanceId: input.instanceId,
    unitTemplateId: input.unitTemplateId,
  });
}

/**
 * `request_use_item` — the direct backpack-consumable path, which skips the action window and
 * goes straight to confirmation.
 */
export function beginItemUseConfirmation(input: {
  source: PlayerSessionSource;
  instanceId: string;
  unitTemplateId: string;
}): void {
  setItemInteraction(input.source, {
    kind: 'confirming_use',
    instanceId: input.instanceId,
    unitTemplateId: input.unitTemplateId,
  });
}

/**
 * `close_item_actions`, `cancel_use_item` and session-lifecycle disposal. Idempotent, scoped to
 * one owner.
 */
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

/** Live re-evaluation of one window option against the CURRENT session. */
function isSelectionStillEligible(
  source: PlayerSessionSource,
  action: ItemActionKind,
  instanceId: string,
  unitTemplateId: string,
): boolean {
  const session = PlayerSessionStore.getSession(source);

  if (action === 'use') {
    return evaluateItemUsability({
      session,
      catalog: ITEM_CATALOG,
      playerBlueprints: PLAYER_UNITS,
      unitTemplateId,
      instanceId,
    }).canUse;
  }

  const blueprint = PLAYER_UNITS.find(b => b.templateId === unitTemplateId);
  const unitState = session.roster.units[unitTemplateId];
  if (!blueprint || !unitState) return false;
  const classId = resolveUnitProgression(blueprint, unitState.chosenUpgrades).currentClassId;
  return evaluateEquipItem(unitTemplateId, classId, instanceId, session.inventory, ITEM_CATALOG).ok;
}

/**
 * `select_item_action`. Disposal is this module's job, not the projection's: hiding a modal in
 * the snapshot would leave the authoritative interaction stored, where it could block reopening
 * or reappear later.
 *
 * The order is load-bearing:
 *   1. MATCH FIRST. A stored `choosing_action` for this screen's selected character AND this
 *      action's instance. A mismatched or unrelated action returns without touching anything —
 *      it must never dispose someone else's interaction.
 *   2. Re-validate the matching request live against the current session.
 *   3. On failure, CLEAR and return: no roster write, no inventory write. The window closes
 *      rather than lingering in a state the player cannot act on.
 *   4. On success, clear, then advance to confirmation or delegate the equip.
 *
 * Note the scope: this runs on a SELECTION. Merely losing Use eligibility while the window is
 * open does not close it — the projection keeps showing the window with Use disabled.
 */
export function applyItemActionSelection(input: {
  previousPhase: GamePhase;
  action: ItemActionSelection;
}): void {
  const previous = asEquipPhase(input.previousPhase);
  if (!previous) return;
  const source = previous.sessionSource;
  const { action } = input;

  // 1. Match.
  const interaction = readItemInteractionForPhase(previous);
  if (interaction === null) return;
  if (interaction.kind !== 'choosing_action') return;
  if (interaction.instanceId !== action.instanceId) return;

  const { unitTemplateId } = interaction;

  // 2-3. Re-validate; a matching-but-ineligible selection disposes without changing state.
  if (!isSelectionStillEligible(source, action.action, action.instanceId, unitTemplateId)) {
    clearItemInteraction(source);
    return;
  }

  // 4. Advance.
  clearItemInteraction(source);

  if (action.action === 'use') {
    setItemInteraction(source, {
      kind: 'confirming_use',
      instanceId: action.instanceId,
      unitTemplateId,
    });
    return;
  }

  applyEquipmentPhaseAction({
    source,
    action: { type: 'equip_item', instanceId: action.instanceId, unitTemplateId },
  });
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
  });
  if (!result.ok) return; // silent no-op, exactly like equip/unequip

  PlayerSessionStore.replaceSession(source, result.nextSession);
}
