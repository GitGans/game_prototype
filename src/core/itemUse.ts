import type { ItemUseFailure } from '../shared/itemTypes';
import type { PlayerSessionState } from './playerSessionState';
import { consumeItemForUse } from '../inventory';
import { applyPermanentStatBoostToRoster, applyItemHealingToRoster } from '../progression';
import { evaluateItemUse, itemUseLocationForOrigin, type ItemUseInput } from './itemUsability';

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
