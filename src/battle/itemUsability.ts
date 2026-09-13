import type { BattleItemUseFailure, ReadonlyItemUseEffect } from '../shared/itemTypes';
import type { BattleMode, BattleState } from './types';
import { isAlive } from './lifeState';
import { getDeployment } from './deployment';

/**
 * The READ side of in-battle item activation: is this item usable right now, and for how much.
 *
 * Deliberately a separate module from `itemUse.ts`, which executes. The battle-phase snapshot is
 * allowed to import THIS one and not the executor, so a projection has no path to a state
 * replacement — "does not call" and "cannot reach" are different guarantees, and only the second
 * is enforceable.
 *
 * Effect support lives here and only here (`isSupportedBattleItemEffect`), so the action-bar
 * projection (`core/battlePhaseSnapshot`) and item execution (`battle/itemUse`) cannot
 * independently decide what counts as a supported item and drift apart.
 */

/**
 * Everything the battle domain needs to know about an equipped item: enough to match the
 * requested instance and read the authored amount, and nothing that could reach an inventory,
 * a container or a session. The runtime owns the full record (`BattleUsableResource`).
 */
export interface BattleItemResource {
  readonly instanceId: string;
  readonly name: string;
  readonly effect: ReadonlyItemUseEffect;
}

/** The single definition of "this item can do something in battle". */
export function isSupportedBattleItemEffect(effect: ReadonlyItemUseEffect): boolean {
  return effect.type === 'heal';
}

export type BattleItemEligibility =
  | { ok: true; amount: number }
  | { ok: false; reason: BattleItemUseFailure };

export function evaluateBattleItemUse(input: {
  state: BattleState;
  /** From the validated runtime. */
  mode: BattleMode;
  unitId: string;
  instanceId: string;
  resource: BattleItemResource | null;
  alreadyConsumed: boolean;
}): BattleItemEligibility {
  const { state, mode, unitId, instanceId, resource, alreadyConsumed } = input;

  // Manual mode FIRST, and as its own check: `state.phase === 'select_target'` is set on
  // automatic turns too (turnResolver steps 6 and 7), so the phase alone never establishes
  // manual player control.
  if (mode !== 'manual') return { ok: false, reason: 'not_manual_mode' };
  if (state.phase !== 'select_target') return { ok: false, reason: 'not_awaiting_manual_action' };

  if (state.roundQueue[0] !== unitId) return { ok: false, reason: 'not_active_unit' };

  const unit = state.units.get(unitId);
  if (!unit || unit.side !== 'player') return { ok: false, reason: 'not_active_unit' };
  if (!isAlive(unit)) return { ok: false, reason: 'unit_dead' };

  const deployment = getDeployment(state, unitId);
  if (deployment?.kind !== 'field') return { ok: false, reason: 'unit_not_on_field' };

  if (resource === null || resource.instanceId !== instanceId) {
    return { ok: false, reason: 'instance_mismatch' };
  }
  if (alreadyConsumed) return { ok: false, reason: 'already_consumed' };

  if (!isSupportedBattleItemEffect(resource.effect)) {
    return { ok: false, reason: 'unsupported_effect' };
  }
  // Narrowing follows the support check, so adding a supported variant is a compile error here
  // rather than a silent fall-through.
  if (resource.effect.type !== 'heal') return { ok: false, reason: 'unsupported_effect' };

  const { amount } = resource.effect;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };

  // Restoring nothing is refused rather than silently spending the item — the same rule the
  // out-of-combat path applies, decided here from runtime HP.
  if (unit.hp >= unit.maxHp) return { ok: false, reason: 'unit_full_hp' };

  return { ok: true, amount };
}
