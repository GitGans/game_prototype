import type { ItemHealFailure } from '../shared/itemTypes';
import type { RosterState, PlayerUnitState } from './rosterState';

/**
 * Current-HP restoration from consumable use. Pure: no storage, no item containers, no catalog.
 *
 * `currentHp` and `maxHp` arrive ALREADY resolved — the caller normalizes current HP with the
 * core-owned `clampAliveCurrentHp` (core/playerUnitPersistence.ts), which progression must not
 * import. This module therefore never re-implements that clamp; it owns only the restoration
 * formula and re-applies the "full HP is stored as null" rule from the PlayerUnitState HP
 * invariant (rosterState.ts), which progression owns.
 *
 * Sibling of `consumableStatBoost.ts`, and deliberately a separate module: a heal never touches
 * `permanentBonuses` or max HP, and a permanent boost never refuses a full-health target.
 */

export interface ItemHealingInput {
  unit: PlayerUnitState;
  /** The item's authored heal amount. */
  amount: number;
  /** Max HP resolved from blueprint + level + upgrades + equipment + permanentBonuses. */
  maxHp: number;
  /** Alive current HP, already normalized by the caller via clampAliveCurrentHp(). */
  currentHp: number;
}

export interface ItemHealing {
  /** min(amount, maxHp - currentHp); always > 0 on an `ok` result. */
  restoredHp: number;
  nextHp: number;
}

export type EvaluateItemHealingResult =
  | { ok: true; healing: ItemHealing }
  | { ok: false; reason: ItemHealFailure };

export function evaluateItemHealing(
  input: ItemHealingInput,
): EvaluateItemHealingResult {
  const { unit, amount, maxHp, currentHp } = input;

  if (unit.lifeState === 'dead') return { ok: false, reason: 'unit_dead' };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
  if (!Number.isFinite(maxHp) || !Number.isFinite(currentHp)) {
    return { ok: false, reason: 'invalid_result' };
  }

  // A heal with nothing to restore is refused, never silently applied: consuming the item for
  // no effect is the outcome this rule exists to prevent.
  if (currentHp >= maxHp) return { ok: false, reason: 'unit_full_hp' };

  const restoredHp = Math.min(amount, maxHp - currentHp);
  const nextHp = currentHp + restoredHp;
  if (!Number.isFinite(nextHp)) return { ok: false, reason: 'invalid_result' };

  return { ok: true, healing: { restoredHp, nextHp } };
}

export type ItemHealingRosterResult =
  | { ok: true; nextRoster: RosterState }
  | { ok: false; reason: ItemHealFailure | 'unit_not_found' };

/** Roster-level wrapper, matching the applyPermanentStatBoostToRoster shape. */
export function applyItemHealingToRoster(
  roster: RosterState,
  templateId: string,
  healing: Omit<ItemHealingInput, 'unit'>,
): ItemHealingRosterResult {
  const unit = roster.units[templateId];
  if (!unit) return { ok: false, reason: 'unit_not_found' };

  // The single formula: application never re-derives what evaluation decided.
  const evaluated = evaluateItemHealing({ ...healing, unit });
  if (!evaluated.ok) return evaluated;

  const { nextHp } = evaluated.healing;
  return {
    ok: true,
    nextRoster: {
      units: {
        ...roster.units,
        // Only currentHp changes — level, isInCamp, lastPlacement, permanentBonuses,
        // chosenUpgrades and lifeState are carried through by the spread. Storage rule:
        // full HP is stored as null (see the PlayerUnitState HP invariant).
        [templateId]: { ...unit, currentHp: nextHp === healing.maxHp ? null : nextHp },
      },
    },
  };
}
