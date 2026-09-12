import type { GamePhase, PhaseAction } from './phases';
import { PlayerSessionStore } from './playerSessionStore';
import { requireBattleRuntimeForPhase } from './battleRuntimeAccess';
import { installBattleRuntime, clearBattleRuntime } from './battleRuntimeWriteAccess';
import type {
  BattleExitOutcome,
  BattleItemConsumptionRecord,
  BattleRuntimeContext,
} from './battleRuntimeContext';
import type { BattleItemResource } from '../battle/itemUsability';
import { settleBattleItemConsumption } from './battleItemSettlement';
import { ITEM_CATALOG } from '../data/itemDefinitions';
import {
  createBattleRuntimeForSession,
  createReplayBattleRuntimeForSession,
} from './battleStart';
import { resetTurnContextForNewBattle } from '../battle/turnResolver';
import { type PhaseEffectsResult, NO_PHASE_EFFECTS } from './phaseEffectsResult';
import type { Rng } from '../shared/random';
import {
  isBattleLifecycleAction,
  applyBattleLifecyclePhaseAction,
  isBattleTurnAction,
  applyBattleTurnAction,
  isBattlePlacementAction,
  applyBattlePlacementAction,
  computeBattleExitRoster,
  setBattlePreviewTarget,
  projectBattleActionFeedback,
  type BattleLifecycleAction,
  type BattleTurnPhaseAction,
  type BattlePlacementAction,
} from './phaseHandlers/battlePhaseHandler';

/**
 * The application-level owner of battle runtime reads and writes: it resolves the active
 * `BattleRuntimeContext`, delegates every rule, and installs the result through
 * `battleRuntimeWriteAccess`.
 *
 * This is the ONE production module holding the battle-runtime write capability — importing
 * `battleRuntimeWriteAccess` is that authority, and `RESTRICTED_IMPORT_TARGETS` grants it here
 * and nowhere else.
 *
 * Pure battle rules are NOT here — they live in `phaseHandlers/battlePhaseHandler` (lifecycle,
 * turn, placement), `battleStart` (attempt construction) and the `battle/` domain. This module
 * is the seam between those pure pipelines and the mutable runtime store.
 *
 * Every operation validates `runtime.sessionSource` against the battle phase through
 * `requireBattleRuntimeForPhase()` inside its own body. No operation relies on another having
 * validated first — a mismatched debug runtime must throw, never fall back to campaign state.
 *
 * Only `BattleActionFeedback` may leave this module. The handler result, the runtime, the
 * `BattleState`, the `TurnContext`, the pending auto-turn intention and the unprojected
 * directive all alias committed runtime state and are excluded from `PhaseEffectsResult` by type.
 */

type BattlePhase = Extract<GamePhase, { type: 'battle' }>;

/**
 * Narrows the attempt's equipped items to what the battle domain may see: an id to match, a name
 * to report, and an authored effect. No instance/definition ownership, no session.
 *
 * A consumed item has already been removed from `usableResources`, so absence here IS "already
 * consumed" — there is no second bookkeeping to keep in step.
 */
function projectBattleItemResources(
  runtime: BattleRuntimeContext,
): ReadonlyMap<string, BattleItemResource> {
  const resources = new Map<string, BattleItemResource>();
  for (const [unitId, resource] of runtime.usableResources) {
    resources.set(unitId, {
      instanceId: resource.instanceId,
      name:       resource.name,
      effect:     resource.effect,
    });
  }
  return resources;
}

/**
 * The closed union of every action that mutates the live battle runtime. Adding a new battle
 * mutation action to `PhaseAction` and routing it here without extending this union is a
 * compile error at the `never` branch of `applyBattleRuntimeMutation()`.
 */
export type BattleRuntimeMutationAction =
  | BattleLifecycleAction
  | BattleTurnPhaseAction
  | BattlePlacementAction
  | Extract<PhaseAction, { type:
      | 'battle_set_mode'
      | 'battle_prepare_quick_battle'
      | 'battle_preview_target'
      | 'battle_clear_preview_target' }>;

/**
 * Applies one battle runtime mutation and returns any transient feedback it produced.
 *
 * The runtime is resolved once, up front: every branch below resolved it as its first act
 * before this was hoisted, so the throw-on-mismatch happens at exactly the same point.
 *
 * Every change installs ONE complete replacement runtime via `installBattleRuntime()` — never
 * two sequential writes for a single action, and never a field-specific write.
 */
export function applyBattleRuntimeMutation(input: {
  previousPhase: BattlePhase;
  action: BattleRuntimeMutationAction;
  battleResolutionRng: Rng;
}): PhaseEffectsResult {
  const { previousPhase, action, battleResolutionRng } = input;
  const runtime = requireBattleRuntimeForPhase(previousPhase);

  // ── Battle lifecycle ──
  // Persists the confirmed (pre-action) placement into the session selected by
  // runtime.sessionSource, before the combat runtime is installed.
  if (isBattleLifecycleAction(action)) {
    const result = applyBattleLifecyclePhaseAction({
      source: runtime.sessionSource,
      state:  runtime.state,
      action,
    });

    installBattleRuntime({
      ...runtime,
      state: result.state,
      turnContext: result.resetTurnContext ? resetTurnContextForNewBattle() : runtime.turnContext,
      pendingAutoTurnIntention: null,
    });
    return NO_PHASE_EFFECTS;
  }

  // ── Battle control ──
  if (action.type === 'battle_set_mode') {
    installBattleRuntime({ ...runtime, mode: action.mode, pendingAutoTurnIntention: null });
    return NO_PHASE_EFFECTS;
  }
  if (action.type === 'battle_prepare_quick_battle') {
    installBattleRuntime({
      ...runtime,
      turnContext: resetTurnContextForNewBattle(),
      pendingAutoTurnIntention: null,
    });
    return NO_PHASE_EFFECTS;
  }

  // ── Battle preview target ──
  if (action.type === 'battle_preview_target' || action.type === 'battle_clear_preview_target') {
    const target = action.type === 'battle_preview_target' ? action.target : null;
    installBattleRuntime({ ...runtime, state: setBattlePreviewTarget(runtime.state, target) });
    return NO_PHASE_EFFECTS;
  }

  // ── Battle turn ──
  // The only branch that consumes the battleResolution stream, and the only branch that
  // produces transient feedback.
  if (isBattleTurnAction(action)) {
    const result = applyBattleTurnAction({
      state:                    runtime.state,
      context:                  runtime.turnContext,
      action,
      mode:                     runtime.mode,
      rng:                      battleResolutionRng,
      pendingAutoTurnIntention: runtime.pendingAutoTurnIntention,
      // A narrow value, not the runtime: the handler never resolves a runtime and never sees
      // an instance's inventory identity.
      itemResources:            projectBattleItemResources(runtime),
    });

    // Manage pending intention lifecycle:
    // decide stores it; apply clears it; everything else leaves it untouched.
    let nextPendingIntention = runtime.pendingAutoTurnIntention;
    if (action.type === 'battle_decide_auto_turn') {
      nextPendingIntention =
        result.autoTurnDirective?.type === 'intention'
          ? result.autoTurnDirective.intention
          : null;
    } else if (action.type === 'battle_apply_auto_turn') {
      nextPendingIntention = null;
    }

    // A successful activation drops the consumed resource and appends one record — in the SAME
    // single installation as the new state, so no intermediate runtime exists in which the HP
    // is restored but the potion is still available.
    let nextResources = runtime.usableResources;
    let nextConsumed = runtime.consumedItems;
    if (result.itemUse) {
      const consumed = runtime.usableResources.get(result.itemUse.unitId);
      if (consumed) {
        const remaining = new Map(runtime.usableResources);
        remaining.delete(result.itemUse.unitId);
        nextResources = remaining;
        nextConsumed = [...runtime.consumedItems, {
          instanceId:     consumed.instanceId,
          definitionId:   consumed.definitionId,
          unitTemplateId: consumed.unitTemplateId,
        } satisfies BattleItemConsumptionRecord];
      }
    }

    // Any turn action invalidates a pending preview target (skill/active unit/targets change).
    installBattleRuntime({
      ...runtime,
      state: setBattlePreviewTarget(result.state, null),
      turnContext: result.context,
      pendingAutoTurnIntention: nextPendingIntention,
      usableResources: nextResources,
      consumedItems: nextConsumed,
    });
    return { battleFeedback: projectBattleActionFeedback(result) };
  }

  // ── Battle placement ──
  if (isBattlePlacementAction(action)) {
    installBattleRuntime({ ...runtime, state: applyBattlePlacementAction(runtime.state, action) });
    return NO_PHASE_EFFECTS;
  }

  const unhandled: never = action;
  throw new Error(
    `applyBattleRuntimeMutation: unhandled battle mutation action ${JSON.stringify(unhandled)}`,
  );
}

/**
 * Installs the runtime for a new battle attempt (campaign `enter_battle` and debug
 * `start_battle` share this one path).
 *
 * Session, source and enemy group all come from the already-resolved battle phase; there is no
 * campaign/debug branching below the `PlayerSessionStore` lookup. Party validity was enforced in
 * `resolveTransition`, so reaching here with an invalid party is a lifecycle error and
 * `createBattleRuntimeForSession()` throws.
 */
export function startBattleRuntime(input: {
  resolvedPhase: GamePhase;
  battleSetupRng: Rng;
  actionType: 'enter_battle' | 'start_battle';
}): void {
  const { resolvedPhase, battleSetupRng, actionType } = input;
  if (resolvedPhase.type !== 'battle') {
    throw new Error(`startBattleRuntime: "${actionType}" must resolve to a battle phase`);
  }

  const session = PlayerSessionStore.getSession(resolvedPhase.sessionSource);
  installBattleRuntime(createBattleRuntimeForSession({
    session,
    sessionSource: resolvedPhase.sessionSource,
    enemyGroupId:  resolvedPhase.enemyGroupId,
    rng:           battleSetupRng,
  }));
}

/**
 * Installs a replacement runtime for a replay attempt. One pipeline for campaign and debug —
 * the source only selects which session to read; replay policy never branches on it.
 *
 * Only `replaySetup` and `sessionSource` cross the attempt boundary: enemies are restored from
 * the captured placement, players are re-projected from the CURRENT session, and participants
 * are rebuilt for this attempt. The previous attempt's state, participants, mode and turn
 * context are out of scope by the factory's signature, not by convention. Consumes no RNG.
 */
export function replayBattleRuntime(previousPhase: BattlePhase): void {
  const runtime = requireBattleRuntimeForPhase(previousPhase);
  const session = PlayerSessionStore.getSession(runtime.sessionSource);
  installBattleRuntime(createReplayBattleRuntimeForSession({
    session,
    replaySetup:   runtime.replaySetup,
    sessionSource: runtime.sessionSource,
  }));
}

/**
 * Computes the COMPLETE next session for a transition LEAVING the battle phase, and writes it
 * once. One source-neutral pipeline, one storage write, no campaign/debug conditional.
 *
 * Roster result and item consumption are applied TOGETHER: two sequential writes would publish
 * an intermediate session in which the potion is gone but the battle damage is not yet recorded.
 *
 * `outcome === null` is abandonment or a menu exit: the inventory settles, and the roster keeps
 * whatever persistence policy that route already had (none).
 *
 * A failed settlement THROWS rather than settling partially. Every record was produced by this
 * pipeline against this session, so a mismatch is lifecycle corruption, not a user-facing case.
 *
 * Contains no world consequence: `phaseActionEffects` invokes `applyBattleWorldConsequence()`
 * separately, immediately after this, while the runtime is still installed.
 */
export function finalizeBattleSessionOnExit(input: {
  previousPhase: BattlePhase;
  outcome: BattleExitOutcome | null;
}): void {
  const runtime = requireBattleRuntimeForPhase(input.previousPhase);
  const source  = runtime.sessionSource;
  const session = PlayerSessionStore.getSession(source);

  const settled = settleBattleItemConsumption({
    inventory: session.inventory,
    catalog:   ITEM_CATALOG,
    records:   runtime.consumedItems,
  });
  if (!settled.ok) {
    throw new Error(
      `battlePhaseEffects: item settlement failed (${settled.failure.reason} ` +
      `for "${settled.failure.instanceId}")`,
    );
  }

  const nextRoster = input.outcome === null
    ? session.roster
    : computeBattleExitRoster({ runtime, outcome: input.outcome });

  PlayerSessionStore.replaceSession(source, {
    roster: nextRoster,
    inventory: settled.nextInventory,
  });
}

/**
 * Explicit session-boundary disposal, used only by session lifecycle actions (`new_game`,
 * `init_debug`, `reset_debug_session`, `exit_to_menu`). Those may run from a non-battle phase
 * that the generic finalizer below does not cover, so they dispose the runtime themselves.
 *
 * Kept as a named intent operation rather than inlining `clearBattleRuntime()` at each call
 * site: "dispose whatever attempt the previous session left behind" and "tear down on leaving
 * the battle phase" are different reasons to clear, and `phaseActionEffects` should name which.
 */
export function clearBattleRuntimeIfPresent(): void {
  clearBattleRuntime();          // idempotent — the hasBattleRuntime() guard is no longer needed
}

/**
 * Generic transition cleanup: leaving the battle phase for any non-battle phase always clears
 * the whole runtime atomically, so no stale `BattleRuntimeContext` survives into
 * `battle_results` or any later phase.
 *
 * Structural by design — it compares PHASE TYPES and never action types. An action-name exit
 * catalogue would silently miss every battle-to-non-battle transition added later.
 *
 * Not triggered by: replay and mutation-only battle actions (both keep `resolvedPhase.type ===
 * 'battle'`), battle entry, or any non-battle transition.
 *
 * This replaces the coordinator's previous condition, which additionally required the
 * transition to be a navigation. That clause was redundant: if the previous phase is `battle`
 * and the resolved phase is not, the two objects necessarily differ, so the transition is
 * always a navigation.
 */
export function teardownBattleRuntimeAfterTransition(
  previousPhase: GamePhase,
  resolvedPhase: GamePhase,
): void {
  if (previousPhase.type === 'battle' && resolvedPhase.type !== 'battle') {
    clearBattleRuntime();
  }
}
