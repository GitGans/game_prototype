import type { UnitBattleStatKey } from '../shared/unitTypes';
import type { ItemBoostFailure } from '../shared/itemTypes';
import type { RosterState, PlayerUnitState } from './rosterState';

/**
 * Permanent stat boosts from consumable use. Pure: no storage, no item containers, no catalog.
 *
 * `oldCurrentHp` arrives ALREADY normalized to a number — the caller resolves it with the existing
 * `clampAliveCurrentHp` (core/playerUnitPersistence.ts), which progression must not import. This
 * module therefore never re-implements that clamp; it only applies the boost and re-applies the
 * "full HP is stored as null" rule from the PlayerUnitState HP invariant (rosterState.ts), which
 * progression owns.
 */

export interface ApplyPermanentStatBoostInput {
  unit: PlayerUnitState;
  stat: UnitBattleStatKey;
  amount: number;
  /** Max HP resolved from blueprint + level + upgrades + equipment + CURRENT permanentBonuses. */
  oldMaxHp: number;
  /** Alive current HP, already normalized by the caller via clampAliveCurrentHp(). */
  oldCurrentHp: number;
}

export type ApplyPermanentStatBoostResult =
  | { ok: true; nextUnit: PlayerUnitState }
  | { ok: false; reason: ItemBoostFailure };

export function applyPermanentStatBoost(
  input: ApplyPermanentStatBoostInput,
): ApplyPermanentStatBoostResult {
  const { unit, stat, amount, oldMaxHp, oldCurrentHp } = input;

  if (unit.lifeState === 'dead') return { ok: false, reason: 'unit_dead' };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };

  const nextBonus = (unit.permanentBonuses[stat] ?? 0) + amount;
  if (!Number.isFinite(nextBonus)) return { ok: false, reason: 'invalid_result' };

  const permanentBonuses = { ...unit.permanentBonuses, [stat]: nextBonus };

  // Non-HP boosts never touch current HP.
  if (stat !== 'hp') return { ok: true, nextUnit: { ...unit, permanentBonuses } };

  const newMaxHp = oldMaxHp + amount;
  const newCurrentHp = Math.min(oldCurrentHp + amount, newMaxHp);
  if (!Number.isFinite(newMaxHp) || !Number.isFinite(newCurrentHp)) {
    return { ok: false, reason: 'invalid_result' };
  }

  return {
    ok: true,
    nextUnit: {
      ...unit,
      permanentBonuses,
      // Storage rule: full HP is stored as null (see the PlayerUnitState HP invariant).
      currentHp: newCurrentHp === newMaxHp ? null : newCurrentHp,
    },
  };
}

export type ConsumeStatBoostRosterResult =
  | { ok: true; nextRoster: RosterState }
  | { ok: false; reason: ItemBoostFailure | 'unit_not_found' };

/** Roster-level wrapper, matching the chooseUnitUpgrade / toggleUnitCampStatus shape. */
export function applyPermanentStatBoostToRoster(
  roster: RosterState,
  templateId: string,
  boost: Omit<ApplyPermanentStatBoostInput, 'unit'>,
): ConsumeStatBoostRosterResult {
  const unit = roster.units[templateId];
  if (!unit) return { ok: false, reason: 'unit_not_found' };

  const result = applyPermanentStatBoost({ ...boost, unit });
  if (!result.ok) return result;

  return { ok: true, nextRoster: { units: { ...roster.units, [templateId]: result.nextUnit } } };
}
