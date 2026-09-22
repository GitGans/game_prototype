import type { ItemCatalog } from '../shared/itemTypes';
import type { ItemUseFailure } from '../shared/itemTypes';
import type { ItemUsability, ItemUseOrigin } from '../shared/snapshotTypes';
import type { UnitBattleStatKey, UnitBlueprint } from '../shared/unitTypes';
import type { PlayerSessionState } from './playerSessionState';
import { validateItemForUse, getEquippedBonuses, type ItemUseLocation } from '../inventory';
import {
  resolveUnitProgression, resolveUnitBattleStats, evaluateItemHealing,
  evaluateResurrectionEligibility, type PlayerUnitState,
} from '../progression';
import { clampAliveCurrentHp } from './playerUnitPersistence';

/**
 * The out-of-combat item READ MODEL: may a given instance be used on a given character, from a given
 * origin, and to what effect. Pure — no storage, no Phaser, no campaign/debug conditional.
 *
 * Deliberately a separate module from `itemUse.ts`, which executes. The equipment-screen
 * projection is allowed to import THIS module and not the executor, so a read-side module has no
 * path to a roster/inventory replacement — "does not call" and "cannot reach" are different
 * guarantees, and only the second one is enforceable.
 *
 * It performs the whole evaluation, including the arithmetic pre-checks, so the executor adds no
 * rules of its own and the two can never disagree about eligibility.
 *
 * Most effects act on the character the request names. `revive` does not: it names an INITIATOR
 * (the character spending the scroll) and evaluates a set of TARGETS. Both the modal's target list
 * and the commit come from that one evaluation — `evaluateResurrectionRequest` projects it for
 * rendering, `evaluateResurrectionTargetUse` resolves one submitted id from it — so the screen can
 * never offer a character the commit would refuse.
 */

export interface ItemUseInput {
  session: PlayerSessionState;
  catalog: ItemCatalog;
  playerBlueprints: readonly UnitBlueprint[];
  unitTemplateId: string;
  instanceId: string;
  /** Which of the two out-of-combat locations this request is for. */
  origin: ItemUseOrigin;
}

/**
 * The single origin→location mapping, shared by the read model and the executor.
 *
 * Exported so `itemUse` consumes from exactly the location this module validated, WITHOUT the
 * location travelling back through the evaluation result: one input, one mapping, one answer. A
 * second copy of that fact in the result would be a second thing that could disagree.
 *
 * The equipped variant names only the character, never a slot — `validateItemForUse` decides that a
 * usable lives in `usable_slot`, so a caller cannot point consumption at a slot of its choosing.
 */
export function itemUseLocationForOrigin(
  origin: ItemUseOrigin,
  unitTemplateId: string,
): ItemUseLocation {
  return origin === 'backpack'
    ? { kind: 'shared_backpack' }
    : { kind: 'equipped_usable', unitTemplateId };
}

/**
 * The resolved effect the executor needs; never leaves core. Discriminated by effect type so the
 * executor dispatches on data it was given rather than re-reading the catalog.
 */
export interface EvaluatedResurrectionTarget {
  templateId: string;
  /** Resolved from the TARGET's own blueprint, level, upgrades, permanent bonuses and equipment. */
  maxHp: number;
}

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
    }
  | {
      type: 'revive';
      hpPercent: number;
      /** Every target the commit would accept, in blueprint order. Never empty on an `ok` result. */
      targets: readonly EvaluatedResurrectionTarget[];
    };

export type ItemEvaluation =
  | { ok: true; effect: EvaluatedItemEffect }
  | { ok: false; reason: ItemUseFailure };

/**
 * One character's resolved HP pair. The single place this composition lives, shared by the selected
 * character's own effects and by every resurrection target — one formula, one answer, whichever
 * character is being asked about.
 *
 * Max HP is resolved from the SUPPLIED catalog, never the global ITEM_DEFINITIONS: item validation
 * and HP arithmetic must not be able to read different content.
 */
function resolveRosterUnitHp(
  session: PlayerSessionState,
  catalog: ItemCatalog,
  blueprint: UnitBlueprint,
  unitState: PlayerUnitState,
): { maxHp: number; currentHp: number } {
  const progression = resolveUnitProgression(blueprint, unitState.chosenUpgrades);
  const equipmentBonuses = getEquippedBonuses(
    blueprint.templateId,
    session.inventory.containers,
    session.inventory.instances,
    catalog.definitions,
  );
  const maxHp = resolveUnitBattleStats({
    blueprint,
    level: unitState.level,
    upgradeModifiers: progression.statModifiers,
    equipmentBonuses,
    permanentBonuses: unitState.permanentBonuses,
  }).hp;

  // The existing core-owned normalization — progression may not import core, so the caller
  // resolves it here and hands progression a plain number. Nothing is duplicated.
  return { maxHp, currentHp: clampAliveCurrentHp(unitState.currentHp, maxHp) };
}

/**
 * Resurrection eligibility for ONE request: a living, non-camp initiating character, a valid
 * authored percentage, and at least one dead non-camp party member whose max HP can be resolved.
 *
 * Targets are built by walking `playerBlueprints`, so the order every consumer receives is the same
 * blueprint order the equipment screen already uses — no consumer sorts, and there is no second
 * ordering rule. A roster record with no blueprint is SKIPPED, never synthesized (the rule
 * `battleSetupProjection` already applies).
 */
function evaluateResurrectionUse(input: ItemUseInput, hpPercent: number): ItemEvaluation {
  const { session, catalog, playerBlueprints, unitTemplateId } = input;

  if (!Number.isFinite(hpPercent) || hpPercent <= 0 || hpPercent > 100) {
    return { ok: false, reason: 'invalid_amount' };
  }
  if (!playerBlueprints.some(b => b.templateId === unitTemplateId)) {
    return { ok: false, reason: 'blueprint_not_found' };
  }

  // unit_not_found / unit_dead / unit_in_camp / no_valid_targets all come from progression: who is
  // with the party and who may act for it is a roster rule, not an orchestration one.
  const eligibility = evaluateResurrectionEligibility({
    roster: session.roster,
    initiatorTemplateId: unitTemplateId,
  });
  if (!eligibility.ok) return { ok: false, reason: eligibility.reason };

  const eligible = new Set(eligibility.targetTemplateIds);
  const targets: EvaluatedResurrectionTarget[] = [];
  for (const blueprint of playerBlueprints) {
    if (!eligible.has(blueprint.templateId)) continue;
    const targetState = session.roster.units[blueprint.templateId];
    if (!targetState) continue;
    const { maxHp } = resolveRosterUnitHp(session, catalog, blueprint, targetState);
    if (!Number.isFinite(maxHp) || maxHp < 1) continue;
    targets.push({ templateId: blueprint.templateId, maxHp });
  }
  if (targets.length === 0) return { ok: false, reason: 'no_valid_targets' };

  return { ok: true, effect: { type: 'revive', hpPercent, targets } };
}

export function evaluateItemUse(input: ItemUseInput): ItemEvaluation {
  const { session, catalog, playerBlueprints, unitTemplateId, instanceId } = input;

  // Out of combat an item is used either FROM THE BACKPACK — the only place for a consumable — or
  // FROM `usable_slot`, for a usable the character is already carrying. `validateItemForUse` stays
  // the authoritative location validator: kind and placement compatibility are decided there, never
  // here, so an item cannot authorize its own consumption by being in the wrong place.
  const located = validateItemForUse({
    instanceId,
    inventory: session.inventory,
    catalog,
    expected: itemUseLocationForOrigin(input.origin, unitTemplateId),
  });
  if (!located.ok) return { ok: false, reason: located.reason };

  const { useEffect } = located.item;

  // `revive` targets a character OTHER than the one holding the item, so it takes its own branch:
  // it has no `amount`, and its eligibility is about the party rather than the selected character.
  if (useEffect.type === 'revive') {
    return evaluateResurrectionUse(input, useEffect.hpPercent);
  }

  // Any future variant stays unsupported until someone gives it mechanics.
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

  const { maxHp: oldMaxHp, currentHp: oldCurrentHp } =
    resolveRosterUnitHp(session, catalog, blueprint, unitState);

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

export type ResurrectionRequestEvaluation =
  | { ok: true; hpPercent: number; targetTemplateIds: readonly string[] }
  | { ok: false; reason: ItemUseFailure };

/**
 * The renderable form of a resurrection request: the authored percentage and the eligible target
 * IDs, in blueprint order.
 *
 * This is THE list. The snapshot projection must not re-derive eligibility from the roster, or the
 * modal could offer a character the commit then refuses — a target whose max HP cannot be resolved
 * is excluded by `evaluateResurrectionUse` and nowhere else. Resolved HP stays inside
 * `EvaluatedResurrectionTarget` and never reaches a render contract.
 */
export function evaluateResurrectionRequest(input: ItemUseInput): ResurrectionRequestEvaluation {
  const evaluation = evaluateItemUse(input);
  if (!evaluation.ok) return { ok: false, reason: evaluation.reason };
  if (evaluation.effect.type !== 'revive') return { ok: false, reason: 'unsupported_effect' };
  return {
    ok: true,
    hpPercent: evaluation.effect.hpPercent,
    targetTemplateIds: evaluation.effect.targets.map(t => t.templateId),
  };
}

export interface ResurrectionTargetInput extends ItemUseInput {
  /** The dead party member chosen in the modal. Resolved against the evaluated eligible set. */
  targetUnitTemplateId: string;
}

export type ResurrectionTargetEvaluation =
  | { ok: true; hpPercent: number; target: EvaluatedResurrectionTarget }
  | { ok: false; reason: ItemUseFailure };

/**
 * Commit-time evaluation: the SAME request evaluation, then the submitted id resolved from its own
 * eligible set.
 *
 * Nothing supplied by the UI is trusted — not the target id, not the percentage, and certainly not
 * an HP number. A submitted id that is absent from the freshly evaluated set (alive again, moved to
 * camp, removed) is `invalid_target`.
 */
export function evaluateResurrectionTargetUse(
  input: ResurrectionTargetInput,
): ResurrectionTargetEvaluation {
  const evaluation = evaluateItemUse(input);
  if (!evaluation.ok) return { ok: false, reason: evaluation.reason };
  if (evaluation.effect.type !== 'revive') return { ok: false, reason: 'unsupported_effect' };

  const target = evaluation.effect.targets
    .find(t => t.templateId === input.targetUnitTemplateId);
  if (!target) return { ok: false, reason: 'invalid_target' };

  return { ok: true, hpPercent: evaluation.effect.hpPercent, target };
}

/**
 * The render contract: what the equipment screen shows for one usable item, at one origin.
 *
 * The origin is stamped onto the entry — including onto a rejection — so a consumer can tell which
 * request the verdict is about. The resolver compares it against the origin the gesture claims,
 * which is what stops a backpack evaluation authorizing an equipped-slot use.
 */
export function evaluateItemUsability(input: ItemUseInput): ItemUsability {
  const { origin } = input;
  const evaluation = evaluateItemUse(input);
  if (!evaluation.ok) return { canUse: false, origin, reason: evaluation.reason };

  const effect = evaluation.effect;
  // The percentage only: the eligible targets stay out of the per-item render entry, which is keyed
  // by instance and shown in a tooltip. The modal asks for them separately, through the same
  // evaluation.
  if (effect.type === 'revive') {
    return { canUse: true, origin, effect: { type: 'revive', hpPercent: effect.hpPercent } };
  }
  if (effect.type === 'heal') {
    return {
      canUse: true,
      origin,
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
    origin,
    effect: {
      type: 'permanent_stat_boost',
      stat: effect.stat,
      amount: effect.amount,
      healsCurrentHp: effect.stat === 'hp',
    },
  };
}
