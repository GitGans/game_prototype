import type { ItemCatalog, ItemLocationFailure } from '../shared/itemTypes';
import type { InventoryState } from '../inventory';
import { removeItemInstances } from '../inventory';
import type { BattleItemConsumptionRecord } from './battleRuntimeContext';

/**
 * Turns an attempt's consumption records into the next persistent inventory.
 *
 * Consumption is attempt-local during combat — the battle resource and its skill-bar action
 * disappear the moment the item is drunk, while equipment and backpack mutation stay
 * inaccessible — and becomes permanent exactly once, when the attempt is COMPLETED (a `victory` or
 * `defeat` exit). An abandoned attempt (`exit_to_menu`, `new_game`) and a replayed one are never
 * settled: their records are dropped with the runtime, which is what keeps those items in place.
 * This module is that one conversion, and it is pure: it returns the next inventory and installs
 * nothing.
 *
 * Every record is validated against the owning inventory BEFORE anything is written, so a
 * corrupted attempt fails loudly with the session untouched rather than half-settled. Records
 * carry no slot: `equipped_usable` re-derives it through inventory validation rather than
 * trusting a value carried across the boundary.
 */

export type BattleItemSettlementFailure =
  | { reason: 'duplicate_record'; instanceId: string }
  | { reason: 'definition_mismatch'; instanceId: string }
  | { reason: 'invalid_placement'; instanceId: string; cause: ItemLocationFailure };

export type BattleItemSettlementResult =
  | { ok: true; nextInventory: InventoryState }
  | { ok: false; failure: BattleItemSettlementFailure };

export function settleBattleItemConsumption(input: {
  inventory: InventoryState;
  catalog: ItemCatalog;
  records: readonly BattleItemConsumptionRecord[];
}): BattleItemSettlementResult {
  const { inventory, catalog, records } = input;

  // Nothing consumed is the overwhelmingly common case; return the input by identity so an
  // ordinary battle exit publishes no new inventory object.
  if (records.length === 0) return { ok: true, nextInventory: inventory };

  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.instanceId)) {
      return { ok: false, failure: { reason: 'duplicate_record', instanceId: record.instanceId } };
    }
    seen.add(record.instanceId);

    // The record names which definition it believes it consumed. A mismatch means the instance
    // was replaced between the attempt starting and exiting — settle nothing.
    const instance = inventory.instances[record.instanceId];
    if (!instance || instance.definitionId !== record.definitionId) {
      return {
        ok: false,
        failure: { reason: 'definition_mismatch', instanceId: record.instanceId },
      };
    }
  }

  // Placement, ownership and metadata compatibility are inventory's decision, applied to the
  // whole batch before any write.
  const removal = removeItemInstances({
    requests: records.map(record => ({
      instanceId: record.instanceId,
      expected: { kind: 'equipped_usable' as const, unitTemplateId: record.unitTemplateId },
    })),
    inventory,
    catalog,
  });

  if (!removal.ok) {
    return {
      ok: false,
      failure: {
        reason: 'invalid_placement',
        instanceId: removal.instanceId,
        cause: removal.reason,
      },
    };
  }

  return { ok: true, nextInventory: removal.nextInventory };
}
