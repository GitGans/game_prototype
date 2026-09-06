import type { ConsumableUseFailure } from '../shared/itemTypes';
import type { PlayerSessionState } from './playerSessionState';
import { consumeBackpackItem } from '../inventory';
import { applyPermanentStatBoostToRoster } from '../progression';
import { evaluateConsumable, type ConsumableUseInput } from './consumableUsability';

export type { ConsumableUseInput };

/**
 * The consumable EXECUTOR: grants the permanent bonus and destroys the instance, together.
 * Pure — no storage, no Phaser, no campaign/debug conditional; the caller supplies the session,
 * the catalog and the blueprints and installs the result.
 *
 * It owns no eligibility rule of its own: every check lives in `evaluateConsumable`, which the
 * read model uses too, so a prompt can never advertise an action this refuses. Splitting the two
 * across modules is what keeps the equipment-screen projection unable to reach this function at
 * all — its import allowlist names `core/consumableUsability` and not this file.
 */

export type UseConsumableResult =
  | { ok: true; nextSession: PlayerSessionState }
  | { ok: false; reason: ConsumableUseFailure };

export function useConsumableItem(input: ConsumableUseInput): UseConsumableResult {
  const evaluation = evaluateConsumable(input);
  if (!evaluation.ok) return { ok: false, reason: evaluation.reason };

  // Both delegates receive pre-validated data and neither mutates its input, so a partial apply
  // is impossible: either the complete next session is returned or the caller's is untouched.
  const rosterResult = applyPermanentStatBoostToRoster(
    input.session.roster,
    input.unitTemplateId,
    {
      stat: evaluation.stat,
      amount: evaluation.amount,
      oldMaxHp: evaluation.oldMaxHp,
      oldCurrentHp: evaluation.oldCurrentHp,
    },
  );
  if (!rosterResult.ok) return { ok: false, reason: rosterResult.reason };

  const inventoryResult = consumeBackpackItem(
    input.instanceId,
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
