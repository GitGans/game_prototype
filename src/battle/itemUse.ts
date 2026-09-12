import type { BattleItemUseFailure } from '../shared/itemTypes';
import type { BattleEvent } from './battleEvents';
import type { BattleMode, BattleState, ResolvedHitCell } from './types';
import { requireFieldDeployment } from './deployment';
import { getOccupiedCells } from './shapes';
import { resolveHealWithEvents } from './combat';
import {
  evaluateBattleItemUse,
  type BattleItemResource,
} from './itemUsability';

/**
 * The WRITE side of in-battle item activation. It imports the evaluator and adds no rule of its
 * own, so the action bar's enabled state and the outcome of a click are one decision.
 *
 * Nothing that projects a snapshot imports this module.
 */

export interface BattleItemUseSuccess {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
  /** The ACTUAL restoration, already clamped to missing HP by the healing primitive. */
  readonly restoredHp: number;
}

export type ApplyBattleItemUseResult =
  | { ok: true; result: BattleItemUseSuccess }
  | { ok: false; reason: BattleItemUseFailure };

export function applyBattleItemUse(input: {
  state: BattleState;
  mode: BattleMode;
  unitId: string;
  instanceId: string;
  resource: BattleItemResource | null;
  alreadyConsumed: boolean;
}): ApplyBattleItemUseResult {
  const eligibility = evaluateBattleItemUse(input);
  if (!eligibility.ok) return { ok: false, reason: eligibility.reason };

  const { state, unitId } = input;
  const unit = state.units.get(unitId)!;   // non-null: eligibility resolved it

  // Self-target hit cells, built explicitly rather than borrowed from a targeting policy: the
  // item is not a skill and has no pattern. Multiplier 1 — the authored amount, undiluted.
  const anchor = requireFieldDeployment(state, unitId).anchor;
  const cells: ResolvedHitCell[] = getOccupiedCells(anchor, unit.shape)
    .map(coord => ({ coord, multiplier: 1 }));

  // The existing battle healing primitive: it clamps to missing HP and skips dead targets, so
  // no clamping rule is restated here.
  const { state: healed, heals } = resolveHealWithEvents(cells, eligibility.amount, state);

  const restoredHp = heals.find(h => h.unitId === unitId)?.amount ?? 0;

  const events: BattleEvent[] = [{
    type: 'item_heal',
    unitId,
    unitName: unit.name,
    itemName: input.resource!.name,   // non-null: eligibility matched the instance
    amount: restoredHp,
  }];

  return { ok: true, result: { state: healed, events, restoredHp } };
}

export type { BattleItemResource };
