import type { ItemUseFailure } from '../shared/itemTypes';
import type { PlayerSessionState } from './playerSessionState';
import { consumeItemForUse } from '../inventory';
import {
  applyPermanentStatBoostToRoster, applyItemHealingToRoster, applyUnitResurrectionToRoster,
} from '../progression';
import {
  evaluateItemUse, evaluateResurrectionTargetUse, itemUseLocationForOrigin,
  type ItemUseInput, type ResurrectionTargetInput,
} from './itemUsability';

export type { ItemUseInput };

/**
 * The out-of-combat item EXECUTOR: applies the effect and destroys the instance, together — from
 * whichever origin the caller's input names (shared backpack or `usable_slot`).
 * Pure — no storage, no Phaser, no campaign/debug conditional; the caller supplies the session,
 * the catalog and the blueprints and installs the result.
 *
 * It owns no eligibility rule of its own: every check lives in `evaluateItemUse`, which the
 * read model uses too, so a prompt can never advertise an action this refuses. Splitting the two
 * across modules is what keeps the equipment-screen projection unable to reach this function at
 * all — its import allowlist names `core/itemUsability` and not this file.
 *
 * Both delegates receive pre-validated data and mutate nothing, so a partial apply is impossible:
 * either the complete next session is returned or the caller's is untouched.
 */

export type UseItemResult =
  | { ok: true; nextSession: PlayerSessionState }
  | { ok: false; reason: ItemUseFailure };

export function useItem(input: ItemUseInput): UseItemResult {
  const evaluation = evaluateItemUse(input);
  if (!evaluation.ok) return { ok: false, reason: evaluation.reason };

  // Dispatch on the ALREADY-EVALUATED effect, never on a fresh catalog read: the roster operation
  // and the eligibility decision are then guaranteed to be about the same effect.
  //
  // Both delegates receive pre-validated data and neither mutates its input, so a partial apply
  // is impossible: either the complete next session is returned or the caller's is untouched.
  const effect = evaluation.effect;
  // Resurrection needs a chosen target and belongs to `useResurrectionItem`. Refusing it HERE makes
  // "no target-selection interaction, no revive" a property of the executor rather than of its
  // callers' discipline: there is no code path that raises a character without one.
  if (effect.type === 'revive') return { ok: false, reason: 'unsupported_effect' };

  const rosterResult = effect.type === 'heal'
    ? applyItemHealingToRoster(
        input.session.roster,
        input.unitTemplateId,
        { amount: effect.amount, maxHp: effect.maxHp, currentHp: effect.currentHp },
      )
    : applyPermanentStatBoostToRoster(
        input.session.roster,
        input.unitTemplateId,
        {
          stat: effect.stat,
          amount: effect.amount,
          oldMaxHp: effect.oldMaxHp,
          oldCurrentHp: effect.oldCurrentHp,
        },
      );
  if (!rosterResult.ok) return { ok: false, reason: rosterResult.reason };

  // The location comes from the SAME mapping the evaluation above validated through, applied to the
  // same input — so consumption can only ever remove the item from the place eligibility was decided
  // about, with no second copy of that fact to fall out of step.
  const inventoryResult = consumeItemForUse(
    input.instanceId,
    itemUseLocationForOrigin(input.origin, input.unitTemplateId),
    input.session.inventory,
    input.catalog,
  );
  if (!inventoryResult.ok) return { ok: false, reason: inventoryResult.reason };

  return {
    ok: true,
    nextSession: {
      roster: rosterResult.nextRoster,
      inventory: inventoryResult.nextInventory,
    },
  };
}

export type { ResurrectionTargetInput as ResurrectionUseInput };

/**
 * The out-of-combat RESURRECTION executor: raises the chosen target and destroys the instance,
 * together.
 *
 * Two characters are involved and they are never confused: the roster write lands on the TARGET,
 * while consumption is validated against the INITIATOR and the origin the request was admitted for
 * — the scroll leaves the initiator's `usable_slot` or the shared backpack, never the raised
 * character's equipment.
 *
 * Consumption is immediate and permanent. Unlike an in-battle activation there is no attempt-local
 * consumption record and no deferred settlement: there is no attempt to settle.
 *
 * Like `useItem` it owns no eligibility rule — every check lives in `evaluateResurrectionTargetUse`,
 * which the projection uses too — and every step builds an immutable result, so either the complete
 * next session is returned or the caller's is untouched.
 */
export function useResurrectionItem(input: ResurrectionTargetInput): UseItemResult {
  const evaluation = evaluateResurrectionTargetUse(input);
  if (!evaluation.ok) return { ok: false, reason: evaluation.reason };

  const rosterResult = applyUnitResurrectionToRoster(
    input.session.roster,
    evaluation.target.templateId,
    { hpPercent: evaluation.hpPercent, maxHp: evaluation.target.maxHp },
  );
  if (!rosterResult.ok) return { ok: false, reason: rosterResult.reason };

  // The INITIATOR's location, through the same mapping the evaluation validated with.
  const inventoryResult = consumeItemForUse(
    input.instanceId,
    itemUseLocationForOrigin(input.origin, input.unitTemplateId),
    input.session.inventory,
    input.catalog,
  );
  if (!inventoryResult.ok) return { ok: false, reason: inventoryResult.reason };

  return {
    ok: true,
    nextSession: {
      roster: rosterResult.nextRoster,
      inventory: inventoryResult.nextInventory,
    },
  };
}
