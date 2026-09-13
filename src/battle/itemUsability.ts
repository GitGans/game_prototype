import type {
  BattleItemTargetMode, BattleItemUseFailure, ReadonlyItemUseEffect,
} from '../shared/itemTypes';
import type { CellCoord } from '../shared/gridTypes';
import type { BattleMode, BattleState } from './types';
import { isAlive } from './lifeState';
import { getDeployment } from './deployment';
import { getDeadFriendlyUnitTargets } from './targeting';

/**
 * The READ side of in-battle item activation: is this item usable right now, for how much, and
 * on which cells.
 *
 * Deliberately a separate module from `itemUse.ts`, which executes. The battle-phase snapshot is
 * allowed to import THIS one and not the executor, so a projection has no path to a state
 * replacement — "does not call" and "cannot reach" are different guarantees, and only the second
 * is enforceable.
 *
 * Effect support and targeting live here and only here (`getBattleItemTargetMode`), so the
 * action-bar projection (`core/battlePhaseSnapshot`), the resolver (via the projected
 * `targetMode`) and item execution (`battle/itemUse`) cannot independently decide what counts as
 * a supported item, or which items need a target, and drift apart.
 */

/**
 * Everything the battle domain needs to know about an equipped item: enough to match the
 * requested instance and read the authored effect, and nothing that could reach an inventory,
 * a container or a session. The runtime owns the full record (`BattleUsableResource`).
 */
export interface BattleItemResource {
  readonly instanceId: string;
  readonly name: string;
  readonly effect: ReadonlyItemUseEffect;
}

/**
 * THE definition of which item effects work in battle and how each chooses its target.
 * `null` = no battle mechanics. Everything outside `battle/` reads the projected `targetMode`
 * and never interprets effect types itself.
 */
export function getBattleItemTargetMode(effect: ReadonlyItemUseEffect): BattleItemTargetMode | null {
  switch (effect.type) {
    case 'heal':                 return 'self';
    case 'revive':               return 'dead_ally';
    case 'permanent_stat_boost': return null;
    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}

/** "This item can do something in battle" — derived from the single definition above. */
export function isSupportedBattleItemEffect(effect: ReadonlyItemUseEffect): boolean {
  return getBattleItemTargetMode(effect) !== null;
}

/**
 * Defensive runtime check of a resource's percent. Deliberately local rather than shared with the
 * catalog builder: authored content is validated at catalog build time by `data/`, and neither
 * layer may import the other.
 */
function isUsableRevivePercent(hpPercent: number): boolean {
  return Number.isFinite(hpPercent) && hpPercent > 0 && hpPercent <= 100;
}

export type EvaluatedBattleItemEffect =
  | { readonly type: 'heal'; readonly amount: number }
  | {
      readonly type: 'revive';
      readonly hpPercent: number;
      /** Every body cell of every dead allied FIELD unit — from the dead-friendly walker. */
      readonly targetCells: readonly CellCoord[];
    };

export type BattleItemEligibility =
  | { ok: true; effect: EvaluatedBattleItemEffect }
  | { ok: false; reason: BattleItemUseFailure };

export interface BattleItemUseInput {
  state: BattleState;
  /** From the validated runtime. */
  mode: BattleMode;
  unitId: string;
  instanceId: string;
  resource: BattleItemResource | null;
  alreadyConsumed: boolean;
}

export function evaluateBattleItemUse(input: BattleItemUseInput): BattleItemEligibility {
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

  const { effect } = resource;
  switch (effect.type) {
    case 'heal': {
      if (!Number.isFinite(effect.amount) || effect.amount <= 0) {
        return { ok: false, reason: 'invalid_amount' };
      }
      // Restoring nothing is refused rather than silently spending the item — the same rule the
      // out-of-combat path applies, decided here from runtime HP.
      if (unit.hp >= unit.maxHp) return { ok: false, reason: 'unit_full_hp' };
      return { ok: true, effect: { type: 'heal', amount: effect.amount } };
    }

    case 'revive': {
      if (!isUsableRevivePercent(effect.hpPercent)) return { ok: false, reason: 'invalid_amount' };
      // The existing dead-friendly walker: same side as the owner, dead, FIELD-deployed — never a
      // living unit, an enemy or a bench unit. Spending the scroll with nobody to revive is
      // refused; the state is recoverable, so the bar renders it disabled.
      const targetCells = getDeadFriendlyUnitTargets(state, unit.side);
      if (targetCells.length === 0) return { ok: false, reason: 'no_valid_targets' };
      return { ok: true, effect: { type: 'revive', hpPercent: effect.hpPercent, targetCells } };
    }

    case 'permanent_stat_boost':
      return { ok: false, reason: 'unsupported_effect' };

    default: {
      const _exhaustive: never = effect;
      return _exhaustive;
    }
  }
}
