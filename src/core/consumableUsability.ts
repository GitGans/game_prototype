import type { ItemCatalog } from '../shared/itemTypes';
import type { ConsumableUseFailure } from '../shared/itemTypes';
import type { ConsumableUsability } from '../shared/snapshotTypes';
import type { UnitBattleStatKey, UnitBlueprint } from '../shared/unitTypes';
import type { PlayerSessionState } from './playerSessionState';
import { validateBackpackConsumable, getEquippedBonuses } from '../inventory';
import { resolveUnitProgression, resolveUnitBattleStats } from '../progression';
import { clampAliveCurrentHp } from './playerUnitPersistence';

/**
 * The consumable READ MODEL: may a given instance be used on a given character, and to what
 * effect. Pure — no storage, no Phaser, no campaign/debug conditional.
 *
 * Deliberately a separate module from `consumableUse.ts`, which executes. The equipment-screen
 * projection is allowed to import THIS module and not the executor, so a read-side module has no
 * path to a roster/inventory replacement — "does not call" and "cannot reach" are different
 * guarantees, and only the second one is enforceable.
 *
 * It performs the whole evaluation, including the arithmetic pre-checks, so the executor adds no
 * rules of its own and the two can never disagree about eligibility.
 */

export interface ConsumableUseInput {
  session: PlayerSessionState;
  catalog: ItemCatalog;
  playerBlueprints: readonly UnitBlueprint[];
  unitTemplateId: string;
  instanceId: string;
}

/** The resolved numbers the executor needs; never leaves core. */
export type ConsumableEvaluation =
  | {
      ok: true;
      stat: UnitBattleStatKey;
      amount: number;
      oldMaxHp: number;
      oldCurrentHp: number;
    }
  | { ok: false; reason: ConsumableUseFailure };

export function evaluateConsumable(input: ConsumableUseInput): ConsumableEvaluation {
  const { session, catalog, playerBlueprints, unitTemplateId, instanceId } = input;

  const located = validateBackpackConsumable(instanceId, session.inventory, catalog);
  if (!located.ok) return { ok: false, reason: located.reason };

  const { useEffect } = located.consumable;
  if (useEffect.type !== 'permanent_stat_boost') return { ok: false, reason: 'unsupported_effect' };

  const { stat, amount } = useEffect;
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

  return { ok: true, stat, amount, oldMaxHp, oldCurrentHp };
}

/** The render contract: what the equipment screen shows for one backpack consumable. */
export function evaluateConsumableUsability(input: ConsumableUseInput): ConsumableUsability {
  const evaluation = evaluateConsumable(input);
  if (!evaluation.ok) return { canUse: false, reason: evaluation.reason };
  return {
    canUse: true,
    effect: {
      stat: evaluation.stat,
      amount: evaluation.amount,
      healsCurrentHp: evaluation.stat === 'hp',
    },
  };
}
