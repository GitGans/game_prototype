import type { BattleItemUseFailure } from '../shared/itemTypes';
import type { CellCoord } from '../shared/gridTypes';
import type { BattleEvent } from './battleEvents';
import type { BattleState, ResolvedHitCell, Unit } from './types';
import { requireFieldDeployment } from './deployment';
import { getOccupiedCells } from './shapes';
import { resolveHealWithEvents } from './combat';
import { getDeadFriendlyUnitAtCell } from './targeting';
import { reviveUnitInBattleByPercent } from './revive';
import {
  evaluateBattleItemUse,
  type BattleItemResource,
  type BattleItemUseInput,
} from './itemUsability';

/**
 * The WRITE side of in-battle item activation: targeting-mode selection, its cancellation, and
 * execution. It imports the evaluator and adds no eligibility rule of its own, so the action
 * bar's enabled state and the outcome of a click are one decision.
 *
 * Every function here is pure and returns results — it never installs anything. The selected
 * item's IDENTITY is runtime-owned (`BattleRuntimeContext.selectedUsableInstanceId`): it arrives
 * here as a narrow input and leaves as a separate result field, and never enters `BattleState`.
 * Only its target cells do, through the existing `validTargets`.
 *
 * Nothing that projects a snapshot imports this module.
 */

// ─── Selection ────────────────────────────────────────────────────────────────

export type SelectBattleItemResult =
  | { ok: true; state: BattleState; selectedInstanceId: string }
  | { ok: false; reason: BattleItemUseFailure };

/**
 * Enters targeting mode for a dead-ally item. Re-validates; never trusts the UI. Returns the
 * battle-state half (the item's target cells, a cleared preview) and the selected id SEPARATELY,
 * for the runtime owner to install together.
 */
export function selectBattleItem(input: BattleItemUseInput): SelectBattleItemResult {
  const eligibility = evaluateBattleItemUse(input);
  if (!eligibility.ok) return eligibility;
  // A self item has nothing to select — it is executed directly.
  if (eligibility.effect.type !== 'revive') return { ok: false, reason: 'invalid_target' };

  return {
    ok: true,
    state: {
      ...input.state,
      validTargets: eligibility.effect.targetCells.map(c => ({ ...c })),
      previewTargetCoord: null,
    },
    selectedInstanceId: input.instanceId,
  };
}

/**
 * The BattleState half of cancelling item targeting: the item's target cells and any preview on
 * them go together with the (runtime-owned) selection, so no committed state can show corpse
 * cells interpreted through an unrelated skill's targeting policy.
 */
export function cancelItemTargeting(state: BattleState): BattleState {
  return { ...state, validTargets: [], previewTargetCoord: null };
}

// ─── Execution ────────────────────────────────────────────────────────────────

export type BattleItemUseSuccess =
  | {
      readonly kind: 'heal';
      readonly state: BattleState;
      readonly events: readonly BattleEvent[];
      /** The ACTUAL restoration, already clamped to missing HP by the healing primitive. */
      readonly restoredHp: number;
    }
  | {
      readonly kind: 'revive';
      readonly state: BattleState;
      readonly events: readonly BattleEvent[];
      readonly targetUnitId: string;
      readonly restoredHp: number;
    };

export type ApplyBattleItemUseResult =
  | { ok: true; result: BattleItemUseSuccess }
  | { ok: false; reason: BattleItemUseFailure };

export type ApplyBattleItemUseInput = BattleItemUseInput & {
  /** null for a self item; the confirmed cell for a targeted item. */
  target: CellCoord | null;
  /** Narrow runtime input: the currently selected item id, or null. */
  selectedInstanceId: string | null;
};

export function applyBattleItemUse(input: ApplyBattleItemUseInput): ApplyBattleItemUseResult {
  const eligibility = evaluateBattleItemUse(input);
  if (!eligibility.ok) return { ok: false, reason: eligibility.reason };

  const owner = input.state.units.get(input.unitId)!;   // non-null: eligibility resolved it
  const itemName = input.resource!.name;                // non-null: eligibility matched it

  switch (eligibility.effect.type) {
    case 'heal':
      if (input.target !== null) return { ok: false, reason: 'invalid_target' };
      return { ok: true, result: applyHeal(input.state, owner, itemName, eligibility.effect.amount) };

    case 'revive':
      return applyRevive(input, owner, itemName, eligibility.effect.hpPercent);
  }
}

function applyHeal(
  state: BattleState,
  owner: Unit,
  itemName: string,
  amount: number,
): BattleItemUseSuccess {
  // Self-target hit cells, built explicitly rather than borrowed from a targeting policy: the
  // item is not a skill and has no pattern. Multiplier 1 — the authored amount, undiluted.
  const anchor = requireFieldDeployment(state, owner.id).anchor;
  const cells: ResolvedHitCell[] = getOccupiedCells(anchor, owner.shape)
    .map(coord => ({ coord, multiplier: 1 }));

  // The existing battle healing primitive: it clamps to missing HP and skips dead targets, so
  // no clamping rule is restated here.
  const { state: healed, heals } = resolveHealWithEvents(cells, amount, state);

  const restoredHp = heals.find(h => h.unitId === owner.id)?.amount ?? 0;

  const events: BattleEvent[] = [{
    type: 'item_heal',
    unitId: owner.id,
    unitName: owner.name,
    itemName,
    amount: restoredHp,
  }];

  return { kind: 'heal', state: healed, events, restoredHp };
}

function applyRevive(
  input: ApplyBattleItemUseInput,
  owner: Unit,
  itemName: string,
  hpPercent: number,
): ApplyBattleItemUseResult {
  const { state, instanceId, target, selectedInstanceId } = input;
  if (selectedInstanceId !== instanceId) return { ok: false, reason: 'item_not_selected' };
  if (target === null) return { ok: false, reason: 'invalid_target' };

  // The existing dead-friendly cell lookup — the same walker that produced the target cells, so
  // a living ally, an enemy, a bench unit, an empty cell or an already-revived corpse all miss.
  const corpse = getDeadFriendlyUnitAtCell(state, owner.side, target);
  if (!corpse) return { ok: false, reason: 'invalid_target' };

  // The shared percentage chokepoint: roundQueue is reused by reference — resurrection itself
  // never inserts the unit into the current round.
  const revived = reviveUnitInBattleByPercent(state, corpse.id, hpPercent);
  if (!revived) return { ok: false, reason: 'invalid_target' };

  const events: BattleEvent[] = [{
    type: 'item_revive',
    unitId: owner.id,
    unitName: owner.name,
    targetId: corpse.id,
    targetName: corpse.name,
    itemName,
    amount: revived.hpRestored,
  }];

  return {
    ok: true,
    result: {
      kind: 'revive',
      state: revived.state,
      events,
      targetUnitId: corpse.id,
      restoredHp: revived.hpRestored,
    },
  };
}

export type { BattleItemResource };
