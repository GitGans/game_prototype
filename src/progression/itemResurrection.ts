import type { ItemResurrectionFailure } from '../shared/itemTypes';
import type { PlayerUnitState, RosterState } from './rosterState';
import { isSelectedForBattle } from './rosterCamp';

/**
 * Out-of-combat resurrection over the PERSISTENT roster: who may raise whom, and to what HP.
 *
 * A different domain from `battle/revive.ts`, which raises a corpse inside a `BattleState`. This
 * one is reachable with no battle in progress, touches no runtime, and is the only place a dead
 * roster record becomes alive again outside battle exit.
 *
 * Party membership is `rosterCamp`'s definition, never a second one: a target qualifies exactly
 * when it is SELECTED FOR BATTLE (outside camp) and dead — which includes a member whose last
 * placement was the bench. Field deployment, bench placement, battle occupancy and turn order are
 * battle concepts and play no part here.
 *
 * Max HP arrives as a resolved number, exactly as in `itemHealing.ts`: composing blueprint, level,
 * upgrades, permanent bonuses and equipment is orchestration's job, and `progression/**` must not
 * import `inventory/` or `core/`.
 */

export type ResurrectionEligibility =
  | { ok: true; targetTemplateIds: string[] }
  | { ok: false; reason: 'unit_not_found' | 'unit_dead' | 'unit_in_camp' | 'no_valid_targets' };

/**
 * May this character initiate a resurrection, and whom can it raise?
 *
 * A dead character cannot act at all, and a character in camp is not with the party — neither may
 * spend a scroll. The same two facts disqualify a TARGET in camp: a scroll reaches the party, not
 * the camp. These restrictions are resurrection-specific and deliberately do not extend to healing
 * or permanent-stat consumables.
 */
export function evaluateResurrectionEligibility(input: {
  roster: RosterState;
  initiatorTemplateId: string;
}): ResurrectionEligibility {
  const initiator = input.roster.units[input.initiatorTemplateId];
  if (!initiator) return { ok: false, reason: 'unit_not_found' };
  if (initiator.lifeState === 'dead') return { ok: false, reason: 'unit_dead' };
  if (!isSelectedForBattle(initiator)) return { ok: false, reason: 'unit_in_camp' };

  const targetTemplateIds = Object.entries(input.roster.units)
    .filter(([templateId, unit]) =>
      templateId !== input.initiatorTemplateId &&
      unit.lifeState === 'dead' &&
      isSelectedForBattle(unit))
    .map(([templateId]) => templateId);

  // An empty set is a recoverable refusal, not a malformed request: the scroll is kept and the
  // reason is shown, exactly like the in-battle `no_valid_targets`.
  if (targetTemplateIds.length === 0) return { ok: false, reason: 'no_valid_targets' };
  return { ok: true, targetTemplateIds };
}

export interface UnitResurrectionInput {
  /** The TARGET being raised — not the character spending the item. */
  unit: PlayerUnitState;
  /** The item's authored share of max HP, in (0, 100]. */
  hpPercent: number;
  /** Max HP resolved by the caller from blueprint + level + upgrades + equipment + permanent bonuses. */
  maxHp: number;
}

export interface UnitResurrection {
  /** ceil(maxHp × hpPercent / 100), never below 1 and never above maxHp. */
  restoredHp: number;
}

export type EvaluateUnitResurrectionResult =
  | { ok: true; resurrection: UnitResurrection }
  | { ok: false; reason: ItemResurrectionFailure };

export function evaluateUnitResurrection(
  input: UnitResurrectionInput,
): EvaluateUnitResurrectionResult {
  const { unit, hpPercent, maxHp } = input;
  if (unit.lifeState !== 'dead') return { ok: false, reason: 'invalid_target' };
  if (!isSelectedForBattle(unit)) return { ok: false, reason: 'unit_in_camp' };
  if (!Number.isFinite(hpPercent) || hpPercent <= 0 || hpPercent > 100) {
    return { ok: false, reason: 'invalid_amount' };
  }
  if (!Number.isFinite(maxHp) || maxHp < 1) return { ok: false, reason: 'invalid_result' };

  // Never below 1: a percentage that rounds to nothing must still produce a living character.
  // It cannot exceed maxHp, because hpPercent is validated at 100 or below.
  const restoredHp = Math.max(1, Math.ceil((maxHp * hpPercent) / 100));
  return { ok: true, resurrection: { restoredHp } };
}

export type UnitResurrectionRosterResult =
  | { ok: true; nextRoster: RosterState }
  | { ok: false; reason: ItemResurrectionFailure };

/**
 * Roster-level wrapper, matching `applyItemHealingToRoster`'s shape: look the unit up, run the
 * evaluator, return a whole new roster. Application never re-derives what evaluation decided, and
 * never applies what it did not decide.
 */
export function applyUnitResurrectionToRoster(
  roster: RosterState,
  templateId: string,
  resurrection: Omit<UnitResurrectionInput, 'unit'>,
): UnitResurrectionRosterResult {
  const unit = roster.units[templateId];
  if (!unit) return { ok: false, reason: 'unit_not_found' };

  const evaluated = evaluateUnitResurrection({ unit, ...resurrection });
  if (!evaluated.ok) return evaluated;

  const { restoredHp } = evaluated.resurrection;
  return {
    ok: true,
    nextRoster: {
      units: {
        ...roster.units,
        [templateId]: {
          // Everything else is carried through: level, upgrades, permanent bonuses, camp
          // membership and last placement all survive a resurrection.
          ...unit,
          lifeState: 'alive',
          // The sparse full-HP form, the same invariant `itemHealing.ts` maintains.
          currentHp: restoredHp === resurrection.maxHp ? null : restoredHp,
        },
      },
    },
  };
}
