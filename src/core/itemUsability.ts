import type { ItemCatalog } from '../shared/itemTypes';
import type { ItemUseFailure } from '../shared/itemTypes';
import type { ItemUsability } from '../shared/snapshotTypes';
import type { UnitBattleStatKey, UnitBlueprint } from '../shared/unitTypes';
import type { PlayerSessionState } from './playerSessionState';
import { validateItemForUse, getEquippedBonuses } from '../inventory';
import {
  resolveUnitProgression, resolveUnitBattleStats, evaluateItemHealing,
} from '../progression';
import { clampAliveCurrentHp } from './playerUnitPersistence';

/**
 * The out-of-combat item READ MODEL: may a given backpack instance be used on a given character,
 * and to what effect. Pure — no storage, no Phaser, no campaign/debug conditional.
 *
 * Deliberately a separate module from `itemUse.ts`, which executes. The equipment-screen
 * projection is allowed to import THIS module and not the executor, so a read-side module has no
 * path to a roster/inventory replacement — "does not call" and "cannot reach" are different
 * guarantees, and only the second one is enforceable.
 *
 * It performs the whole evaluation, including the arithmetic pre-checks, so the executor adds no
 * rules of its own and the two can never disagree about eligibility.
 */

export interface ItemUseInput {
  session: PlayerSessionState;
  catalog: ItemCatalog;
  playerBlueprints: readonly UnitBlueprint[];
  unitTemplateId: string;
  instanceId: string;
}

/**
 * The resolved effect the executor needs; never leaves core. Discriminated by effect type so the
 * executor dispatches on data it was given rather than re-reading the catalog.
 */
export type EvaluatedItemEffect =
  | {
      type: 'permanent_stat_boost';
      stat: UnitBattleStatKey;
      amount: number;
      oldMaxHp: number;
      oldCurrentHp: number;
    }
  | {
      type: 'heal';
      amount: number;
      maxHp: number;
      currentHp: number;
      restoredHp: number;
    };

export type ItemEvaluation =
  | { ok: true; effect: EvaluatedItemEffect }
  | { ok: false; reason: ItemUseFailure };

export function evaluateItemUse(input: ItemUseInput): ItemEvaluation {
  const { session, catalog, playerBlueprints, unitTemplateId, instanceId } = input;

  // Out of combat an item is used FROM THE BACKPACK — for a consumable that is the only place,
  // for a usable it is the alternative to activating it in battle from usable_slot.
  const located = validateItemForUse({
    instanceId,
    inventory: session.inventory,
    catalog,
    expected: { kind: 'shared_backpack' },
  });
  if (!located.ok) return { ok: false, reason: located.reason };

  const { useEffect } = located.item;
  // `revive` is executable only in battle, from usable_slot (out-of-combat target selection is
  // future work) — and any future variant stays unsupported until someone gives it mechanics.
  if (useEffect.type !== 'permanent_stat_boost' && useEffect.type !== 'heal') {
    return { ok: false, reason: 'unsupported_effect' };
  }

  const { amount } = useEffect;
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };

  const unitState = session.roster.units[unitTemplateId];
  if (!unitState) return { ok: false, reason: 'unit_not_found' };

  const blueprint = playerBlueprints.find(b => b.templateId === unitTemplateId);
  if (!blueprint) return { ok: false, reason: 'blueprint_not_found' };

  if (unitState.lifeState === 'dead') return { ok: false, reason: 'unit_dead' };

  // Max HP is resolved from the SUPPLIED catalog, never the global ITEM_DEFINITIONS: item
  // validation and HP arithmetic must not be able to read different content.
  const progression = resolveUnitProgression(blueprint, unitState.chosenUpgrades);
  const equipmentBonuses = getEquippedBonuses(
    unitTemplateId,
    session.inventory.containers,
    session.inventory.instances,
    catalog.definitions,
  );
  const oldMaxHp = resolveUnitBattleStats({
    blueprint,
    level: unitState.level,
    upgradeModifiers: progression.statModifiers,
    equipmentBonuses,
    permanentBonuses: unitState.permanentBonuses,
  }).hp;

  // The existing core-owned normalization — progression may not import core, so the caller
  // resolves it here and hands progression a plain number. Nothing is duplicated.
  const oldCurrentHp = clampAliveCurrentHp(unitState.currentHp, oldMaxHp);

  if (useEffect.type === 'heal') {
    // The restoration formula and the full-HP refusal belong to progression; core supplies the
    // resolved numbers and adds no rule of its own.
    const healed = evaluateItemHealing({
      unit: unitState,
      amount,
      maxHp: oldMaxHp,
      currentHp: oldCurrentHp,
    });
    if (!healed.ok) return { ok: false, reason: healed.reason };
    return {
      ok: true,
      effect: {
        type: 'heal',
        amount,
        maxHp: oldMaxHp,
        currentHp: oldCurrentHp,
        restoredHp: healed.healing.restoredHp,
      },
    };
  }

  const { stat } = useEffect;

  // Numeric hygiene, not a gameplay stacking limit: reject arithmetic that cannot produce a
  // finite result BEFORE anything is constructed.
  const nextBonus = (unitState.permanentBonuses[stat] ?? 0) + amount;
  if (
    !Number.isFinite(nextBonus) ||
    !Number.isFinite(oldMaxHp + amount) ||
    !Number.isFinite(oldCurrentHp + amount)
  ) {
    return { ok: false, reason: 'invalid_result' };
  }

  return { ok: true, effect: { type: 'permanent_stat_boost', stat, amount, oldMaxHp, oldCurrentHp } };
}

/** The render contract: what the equipment screen shows for one backpack item. */
export function evaluateItemUsability(input: ItemUseInput): ItemUsability {
  const evaluation = evaluateItemUse(input);
  if (!evaluation.ok) return { canUse: false, reason: evaluation.reason };

  const effect = evaluation.effect;
  if (effect.type === 'heal') {
    return {
      canUse: true,
      effect: {
        type: 'heal',
        amount: effect.amount,
        restoredHp: effect.restoredHp,
        currentHp: effect.currentHp,
        maxHp: effect.maxHp,
      },
    };
  }
  return {
    canUse: true,
    effect: {
      type: 'permanent_stat_boost',
      stat: effect.stat,
      amount: effect.amount,
      healsCurrentHp: effect.stat === 'hp',
    },
  };
}
