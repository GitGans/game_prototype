import type { GamePhase, PhaseAction } from './phases';
import { type PhaseEffectsResult, NO_PHASE_EFFECTS } from './phaseEffectsResult';
import { createDefaultGameplayRngStreams, type GameplayRngStreams } from './random';
import { initializeNewCampaign } from './campaignLifecycle';
import {
  initializeDebugSessionForLevel,
  resetDebugSession,
  clearDebugSession,
} from './debugLifecycle';
import {
  applyMovePartyPhaseAction,
  applyBattleWorldConsequence,
} from './phaseHandlers/worldPhaseHandler';
import { applyEquipmentPhaseAction } from './phaseHandlers/inventoryPhaseHandler';
import {
  openConsumeConfirmation,
  clearConsumeConfirmationIfPresent,
  teardownConsumeConfirmationAfterTransition,
  applyConsumablePhaseAction,
} from './phaseHandlers/consumablePhaseHandler';
import { applyCampPhaseAction } from './phaseHandlers/campPhaseHandler';
import { applyChooseUpgradePhaseAction } from './phaseHandlers/progressionPhaseHandler';
import {
  startBattleRuntime,
  replayBattleRuntime,
  applyBattleExitRosterEffect,
  applyBattleRuntimeMutation,
  clearBattleRuntimeIfPresent,
  teardownBattleRuntimeAfterTransition,
} from './battlePhaseEffects';

/**
 * The write side of the transition pipeline: one exhaustive action dispatcher plus the
 * per-manager stateful composition (the gameplay RNG stream pair).
 *
 * This is a DISPATCHER AND COMPOSITION BOUNDARY, not the owner of domain rules. It may contain
 * exhaustive dispatch and cross-domain lifecycle ordering; it must never contain campaign
 * construction, debug session construction, world immutable-update logic, battle formulas,
 * snapshot construction, or a direct store write. Its import list is the enforcement: it
 * imports owners only — no `GameState`, no `PlayerSessionStore`, no `data/**` catalog, no
 * snapshot builder, no Phaser, no scene, and neither half of the read side
 * (`phaseTransitionMetadata`, `phaseTransitionResolver`).
 *
 * ── Rejection vs. lifecycle corruption ──────────────────────────────────────────────────
 * These are different contracts and are handled differently:
 *
 *   resolver rejection       → public, silent: `transition()` returns `{ status: 'rejected' }`
 *                              and this module is NEVER called.
 *   accepted-then-mismatched → internal lifecycle corruption: THROW.
 *
 * Once `resolveTransition` has accepted an action, an inconsistent `previousPhase` /
 * `resolvedPhase` means an incorrect resolver guard, broken coordinator data flow, a malformed
 * test composition, or a half-implemented new action. Every phase check below is a fail-closed
 * lifecycle assertion, never alternate routing — routing belongs to `resolveTransition`.
 */

export type { GameplayRngStreams };

export type ApplyPhaseActionEffects = (
  action: PhaseAction,
  previousPhase: GamePhase,
  resolvedPhase: GamePhase,
) => PhaseEffectsResult;

export interface PhaseActionEffectsController {
  apply: ApplyPhaseActionEffects;
}

/**
 * Every field is REQUIRED. There are deliberately no optional fields and no production
 * fallbacks: with a partial bag, a test that forgets one fake would silently invoke the real
 * owner and mutate the `GameState` singleton — the hardest class of failure to localize in a
 * suite built on module singletons. Omitting a dependency is a compile error instead.
 *
 * Production composition goes through `createDefaultPhaseActionEffects()`.
 */
export interface PhaseActionEffectsDependencies {
  createRngStreams: () => GameplayRngStreams;
  initializeNewCampaign: typeof initializeNewCampaign;
  initializeDebugSessionForLevel: typeof initializeDebugSessionForLevel;
  resetDebugSession: typeof resetDebugSession;
  clearDebugSession: typeof clearDebugSession;
  applyMovePartyPhaseAction: typeof applyMovePartyPhaseAction;
  applyBattleWorldConsequence: typeof applyBattleWorldConsequence;
  applyEquipmentPhaseAction: typeof applyEquipmentPhaseAction;
  openConsumeConfirmation: typeof openConsumeConfirmation;
  clearConsumeConfirmationIfPresent: typeof clearConsumeConfirmationIfPresent;
  teardownConsumeConfirmationAfterTransition: typeof teardownConsumeConfirmationAfterTransition;
  applyConsumablePhaseAction: typeof applyConsumablePhaseAction;
  applyCampPhaseAction: typeof applyCampPhaseAction;
  applyChooseUpgradePhaseAction: typeof applyChooseUpgradePhaseAction;
  startBattleRuntime: typeof startBattleRuntime;
  replayBattleRuntime: typeof replayBattleRuntime;
  applyBattleExitRosterEffect: typeof applyBattleExitRosterEffect;
  applyBattleRuntimeMutation: typeof applyBattleRuntimeMutation;
  clearBattleRuntimeIfPresent: typeof clearBattleRuntimeIfPresent;
  teardownBattleRuntimeAfterTransition: typeof teardownBattleRuntimeAfterTransition;
}

/**
 * The ONLY production composition entry point.
 *
 * Resolves the real owners and the real RNG factory at CALL time. Nothing is captured in a
 * module-scope object, which is what keeps the RNG characterization seam working: that suite
 * `vi.doMock()`s `core/random` and then dynamically imports the manager graph after
 * `vi.resetModules()`, so the binding referenced here must be resolved after the mock is in
 * place.
 */
export function createDefaultPhaseActionEffects(): PhaseActionEffectsController {
  return createPhaseActionEffects({
    createRngStreams: createDefaultGameplayRngStreams,
    initializeNewCampaign,
    initializeDebugSessionForLevel,
    resetDebugSession,
    clearDebugSession,
    applyMovePartyPhaseAction,
    applyBattleWorldConsequence,
    applyEquipmentPhaseAction,
    openConsumeConfirmation,
    clearConsumeConfirmationIfPresent,
    teardownConsumeConfirmationAfterTransition,
    applyConsumablePhaseAction,
    applyCampPhaseAction,
    applyChooseUpgradePhaseAction,
    startBattleRuntime,
    replayBattleRuntime,
    applyBattleExitRosterEffect,
    applyBattleRuntimeMutation,
    clearBattleRuntimeIfPresent,
    teardownBattleRuntimeAfterTransition,
  });
}

const lifecycleError = (message: string): Error =>
  new Error(`phaseActionEffects: ${message}`);

export function createPhaseActionEffects(
  d: PhaseActionEffectsDependencies,
): PhaseActionEffectsController {
  // Per-controller state. NEVER at module scope: two PhaseManagerClass instances (the
  // production singleton plus any test-constructed one) must not share random state, and a
  // lifecycle reset in one must not be observable in the other.
  let rng: GameplayRngStreams = d.createRngStreams();

  /**
   * Lifecycle reset. Replaces the ENTIRE pair by calling the factory again — individual stream
   * fields are never reassigned, so a fresh session always starts at a fresh RNG boundary for
   * both streams at once.
   */
  const replaceRngStreams = (): void => {
    rng = d.createRngStreams();
  };

  function dispatch(
    action: PhaseAction,
    previousPhase: GamePhase,
    resolvedPhase: GamePhase,
  ): PhaseEffectsResult {
    switch (action.type) {
      // ── Session lifecycle ────────────────────────────────────────────────
      // `new_game` and `exit_to_menu` are the only actions the resolver accepts from ANY
      // phase, so they clear the battle runtime themselves rather than relying on the
      // battle-to-non-battle finalizer, which does not cover a dispatch from e.g. a damaged
      // debug_equip_screen. From a battle phase both clears run; that double call predates
      // this extraction and is preserved.
      case 'new_game':
        d.clearDebugSession();
        d.clearBattleRuntimeIfPresent();
        // Accepted from ANY phase, so dispose both owners rather than relying on the
        // equip-screen teardown below.
        d.clearConsumeConfirmationIfPresent('campaign');
        d.clearConsumeConfirmationIfPresent('debug');
        replaceRngStreams();
        d.initializeNewCampaign();
        return NO_PHASE_EFFECTS;

      case 'init_debug':
        d.clearBattleRuntimeIfPresent();
        d.clearConsumeConfirmationIfPresent('debug');
        replaceRngStreams();
        d.initializeDebugSessionForLevel(action.level);
        return NO_PHASE_EFFECTS;

      case 'reset_debug_session':
        // Load-bearing: the reset keeps the same phase AND the same selected character, so the
        // structural teardown below would not fire — and it recreates the same authored instance
        // ids, so matching ids would not distinguish the stale request either.
        d.clearBattleRuntimeIfPresent();
        d.clearConsumeConfirmationIfPresent('debug');
        replaceRngStreams();
        d.resetDebugSession();
        return NO_PHASE_EFFECTS;

      case 'exit_to_menu':
        d.clearDebugSession();
        d.clearBattleRuntimeIfPresent();
        d.clearConsumeConfirmationIfPresent('campaign');
        d.clearConsumeConfirmationIfPresent('debug');
        replaceRngStreams();
        return NO_PHASE_EFFECTS;

      // ── Battle attempt lifecycle ─────────────────────────────────────────
      case 'enter_battle':
      case 'start_battle':
        d.startBattleRuntime({
          resolvedPhase,
          battleSetupRng: rng.battleSetup,
          actionType: action.type,
        });
        return NO_PHASE_EFFECTS;

      case 'replay':
        if (previousPhase.type !== 'battle') {
          throw lifecycleError(`"replay" was accepted from a "${previousPhase.type}" phase`);
        }
        d.replayBattleRuntime(previousPhase); // consumes no RNG
        return NO_PHASE_EFFECTS;

      case 'exit_battle':
        if (previousPhase.type !== 'battle') {
          throw lifecycleError(`"exit_battle" was accepted from a "${previousPhase.type}" phase`);
        }
        // Order is load-bearing: the runtime must still be installed for both calls, and each
        // validates it independently. Disposal is the finalizer's job, after this returns —
        // clearing first would make the battle result impossible to apply.
        d.applyBattleExitRosterEffect({ previousPhase, outcome: action.outcome });
        d.applyBattleWorldConsequence({ previousPhase, outcome: action.outcome });
        return NO_PHASE_EFFECTS;

      // ── Battle runtime mutations ─────────────────────────────────────────
      // Every case is listed explicitly rather than funnelled through a type guard: the
      // grouped narrowing must be assignable to BattleRuntimeMutationAction, which is the
      // compile-time proof that the union and this dispatcher agree.
      case 'battle_begin_combat':
      case 'battle_mark_quick_battle_complete':
      case 'battle_set_mode':
      case 'battle_prepare_quick_battle':
      case 'battle_preview_target':
      case 'battle_clear_preview_target':
      case 'battle_start_turn':
      case 'battle_select_skill':
      case 'battle_use_skill':
      case 'battle_advance_turn':
      case 'battle_skip_turn':
      case 'battle_charge_turn':
      case 'battle_quick_turn':
      case 'battle_decide_auto_turn':
      case 'battle_apply_auto_turn':
      case 'select_bench_slot':
      case 'select_field_unit':
      case 'clear_placement_selection':
      case 'place_bench_unit':
      case 'swap_bench_with_field':
      case 'move_field_unit':
      case 'move_field_unit_to_bench':
      case 'return_field_unit_to_bench':
      case 'swap_field_units':
        if (previousPhase.type !== 'battle') {
          throw lifecycleError(
            `battle mutation "${action.type}" was accepted from a "${previousPhase.type}" phase`,
          );
        }
        return d.applyBattleRuntimeMutation({
          previousPhase,
          action,
          battleResolutionRng: rng.battleResolution,
        });

      // ── World ────────────────────────────────────────────────────────────
      case 'move_party':
        if (previousPhase.type !== 'world_map') {
          throw lifecycleError(`"move_party" was accepted from a "${previousPhase.type}" phase`);
        }
        d.applyMovePartyPhaseAction(action);
        return NO_PHASE_EFFECTS;

      // ── Screen mutations, routed to the session named by the current phase ──
      case 'equip_item':
      case 'unequip_item':
        if (previousPhase.type !== 'equip_screen' && previousPhase.type !== 'debug_equip_screen') {
          throw lifecycleError(
            `"${action.type}" was accepted from a "${previousPhase.type}" phase`,
          );
        }
        d.applyEquipmentPhaseAction({ source: previousPhase.sessionSource, action });
        return NO_PHASE_EFFECTS;

      // ── Consumable confirmation ──────────────────────────────────────────
      // Request and cancel change PRESENTATION state only — no roster or inventory write. The
      // owner is the equip screen's own session, so a campaign screen can never file or dispose
      // a debug request.
      case 'request_consume_item':
      case 'cancel_consume_item':
        if (previousPhase.type !== 'equip_screen' && previousPhase.type !== 'debug_equip_screen') {
          throw lifecycleError(
            `"${action.type}" was accepted from a "${previousPhase.type}" phase`,
          );
        }
        if (action.type === 'request_consume_item') {
          d.openConsumeConfirmation({
            source: previousPhase.sessionSource,
            instanceId: action.instanceId,
            // Always the selected character — never a caller-chosen target.
            unitTemplateId: previousPhase.selectedUnitTemplateId,
          });
        } else {
          d.clearConsumeConfirmationIfPresent(previousPhase.sessionSource);
        }
        return NO_PHASE_EFFECTS;

      case 'confirm_consume_item':
        if (previousPhase.type !== 'equip_screen' && previousPhase.type !== 'debug_equip_screen') {
          throw lifecycleError(
            `"confirm_consume_item" was accepted from a "${previousPhase.type}" phase`,
          );
        }
        d.applyConsumablePhaseAction({ previousPhase, action });
        return NO_PHASE_EFFECTS;

      case 'toggle_camp_unit':
        if (previousPhase.type !== 'camp' && previousPhase.type !== 'debug_equip_screen') {
          throw lifecycleError(
            `"toggle_camp_unit" was accepted from a "${previousPhase.type}" phase`,
          );
        }
        d.applyCampPhaseAction({ source: previousPhase.sessionSource, action });
        return NO_PHASE_EFFECTS;

      case 'choose_upgrade':
        if (previousPhase.type !== 'upgrade_tree') {
          throw lifecycleError(
            `"choose_upgrade" was accepted from a "${previousPhase.type}" phase`,
          );
        }
        d.applyChooseUpgradePhaseAction({
          source: previousPhase.sessionSource,
          unitTemplateId: previousPhase.unitTemplateId,
          action,
        });
        return NO_PHASE_EFFECTS;

      // ── Navigation-only: no mutation, by design ──────────────────────────
      case 'debug':
      case 'enter_camp':
      case 'exit_camp':
      case 'exit_results':
      case 'open_equip_screen':
      case 'close_equip_screen':
      case 'switch_equip_unit':
      case 'open_upgrade_tree':
      case 'close_upgrade_tree':
      case 'return_to_debug_level_select':
      case 'switch_debug_unit':
        return NO_PHASE_EFFECTS;

      // ── Unsupported commerce ─────────────────────────────────────────────
      // `resolveTransition` returns null for both today, so this is unreachable. Throwing
      // rather than no-opping means a future shop implementation cannot silently ship as an
      // applied no-op that appears to work.
      case 'buy_item':
      case 'sell_item':
        throw lifecycleError(
          `"${action.type}" has no effects implementation (no shop phase exists yet); ` +
          'resolveTransition must keep rejecting it',
        );

      default: {
        const unhandled: never = action;
        throw lifecycleError(`unhandled action ${JSON.stringify(unhandled)}`);
      }
    }
  }

  const apply: ApplyPhaseActionEffects = (action, previousPhase, resolvedPhase) => {
    const effects = dispatch(action, previousPhase, resolvedPhase);
    // Runs only after the action-specific effect succeeded. If it threw, teardown, snapshot
    // rebuild, commit and sync/notify are all skipped — the existing non-transactional
    // contract. Nothing is rolled back.
    d.teardownConsumeConfirmationAfterTransition(previousPhase, resolvedPhase);
    d.teardownBattleRuntimeAfterTransition(previousPhase, resolvedPhase);
    return effects;
  };

  return { apply };
}
