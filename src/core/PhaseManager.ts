import { GamePhase, PhaseAction } from './phases';
import type { PhaseSceneSynchronizer } from './phaseSceneSynchronizer';
import type { DebugBattleState, DebugSessionConfig } from './DebugBattleState';
import { initializeDebugSession, resetDebugSession, clearDebugSession } from './debugLifecycle';
import { initCampaignState } from './initCampaignState';
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from '../data/campaignInitialStateDefinition';
import { GameState } from './GameState';
import { MAP_DEFINITIONS } from '../data/mapDefinitions';
import { PLAYER_UNITS } from '../data/units';
import { ITEM_CATALOG } from '../data/itemDefinitions';
import { CAMPAIGN_STARTING_ITEMS } from '../data/startingInventoryDefinitions';
import { applyMovePartyToCampaign } from './worldMapProjection';
import { resolveTransition } from './phaseTransitionResolver';
import { derivePhaseTransitionMetadata } from './phaseTransitionMetadata';
import { rebuildPhaseSnapshot } from './phaseSnapshotRebuilder';
import { notifyPhaseChanged } from './phaseChangeNotifier';
import { requireBattleRuntimeForPhase } from './battleRuntimeAccess';
import { PlayerSessionStore } from './playerSessionStore';
import { applyEquipmentPhaseAction } from './phaseHandlers/inventoryPhaseHandler';
import { applyCampPhaseAction } from './phaseHandlers/campPhaseHandler';
import { applyChooseUpgradePhaseAction } from './phaseHandlers/progressionPhaseHandler';
import {
  createBattleRuntimeForSession,
  createReplayBattleRuntimeForSession,
} from './battleStart';
import {
  isBattlePlacementAction,
  applyBattlePlacementAction,
  isBattleTurnAction,
  applyBattleTurnAction,
  isBattleLifecycleAction,
  applyBattleLifecyclePhaseAction,
  applyBattleExitPhaseAction,
  setBattlePreviewTarget,
  projectBattleActionFeedback,
} from './phaseHandlers/battlePhaseHandler';
import type { PhaseTransitionResult } from './phaseTransitionResult';
import { type PhaseEffectsResult, NO_PHASE_EFFECTS } from './phaseEffectsResult';
import { resetTurnContextForNewBattle } from '../battle/turnResolver';
import { createDefaultGameplayRngStreams, type GameplayRngStreams } from './random';

export class PhaseManagerClass {
  private phase: GamePhase = { type: 'main_menu' };
  private sceneSynchronizer: PhaseSceneSynchronizer | null = null;
  private rngStreams: GameplayRngStreams = createDefaultGameplayRngStreams();

  /** For tests only — inject deterministic RNG streams. */
  setRngStreamsForTest(streams: GameplayRngStreams): void {
    this.rngStreams = streams;
  }

  /** Resets streams to default MathRng — call after a test that injected scripted streams. */
  resetRngStreams(): void {
    this.rngStreams = createDefaultGameplayRngStreams();
  }

  /**
   * Single reset point for gameplay RNG streams. Called from every session/campaign
   * lifecycle action (`init_debug`, `reset_debug_session`, `exit_to_menu`, `new_game`)
   * so a fresh session always starts at a fresh RNG boundary.
   */
  private resetGameplayRngStreams(): void {
    this.rngStreams = createDefaultGameplayRngStreams();
  }

  init(sceneSynchronizer: PhaseSceneSynchronizer): void {
    this.sceneSynchronizer = sceneSynchronizer;
  }

  private requireSceneSynchronizer(): PhaseSceneSynchronizer {
    if (!this.sceneSynchronizer) {
      throw new Error(
        'PhaseManager.transition() called before PhaseManager.init() — no PhaseSceneSynchronizer registered.',
      );
    }
    return this.sceneSynchronizer;
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  getDebugState(): DebugBattleState | null {
    return GameState.getDebugState();
  }

  transition(action: PhaseAction): PhaseTransitionResult {
    const previousPhase = this.phase;

    const metadata = derivePhaseTransitionMetadata(previousPhase, action);

    const next = resolveTransition(previousPhase, action, metadata);
    if (next === null) {
      return { status: 'rejected' }; // invalid action for current phase
    }

    // Reference identity, captured before any rebuild. Two traps this guards against:
    //  - rebuildPhaseSnapshot() returns a NEW object for mutation-only battle actions, so
    //    classifying after the rebuild would misreport every in-battle mutation;
    //  - `replay` resolves to `{ ...currentPhase }` — a COPY — so it is a navigation
    //    even though its phase type stays 'battle'. Never compare `.type` here.
    const transitionType: 'navigation' | 'mutation' =
      next === previousPhase ? 'mutation' : 'navigation';

    // Navigation precondition: fail before any side effect runs, so a missing
    // init() call never leaves GameState mutated while `this.phase` is stale.
    const sceneSynchronizer = transitionType === 'navigation' ? this.requireSceneSynchronizer() : null;

    const effects = this.applyActionSideEffects(action, previousPhase, next);

    // Leaving the battle phase always clears the whole runtime atomically — no
    // stale BattleRuntimeContext may survive into battle_results or any other
    // non-battle phase. Entering, replaying, or mutating within battle never
    // triggers this, since `next` stays 'battle' in those cases.
    if (previousPhase.type === 'battle' && transitionType === 'navigation' && next.type !== 'battle') {
      GameState.resetBattleRuntime();
    }

    if (transitionType === 'mutation') {
      // Mutation-only: rebuild snapshot in place, notify scene
      this.phase = rebuildPhaseSnapshot(previousPhase);
      notifyPhaseChanged();
    } else {
      // Navigation: rebuild snapshot for new phase, start scene
      this.phase = rebuildPhaseSnapshot(next);
      sceneSynchronizer!.sync(this.phase);
    }

    return { status: 'applied', battleFeedback: effects.battleFeedback };
  }

  private applyActionSideEffects(
    action: PhaseAction,
    prev: GamePhase,
    next: GamePhase,
  ): PhaseEffectsResult {
    // ── Battle lifecycle ──
    if (isBattleLifecycleAction(action) && prev.type === 'battle') {
      const runtime = requireBattleRuntimeForPhase(prev);
      // Persists the confirmed (pre-action) placement into the session selected by
      // runtime.sessionSource before the combat runtime is installed.
      const result = applyBattleLifecyclePhaseAction({
        source: runtime.sessionSource,
        state:  runtime.state,
        action,
      });

      GameState.setBattleRuntime({
        ...runtime,
        state: result.state,
        turnContext: result.resetTurnContext ? resetTurnContextForNewBattle() : runtime.turnContext,
        pendingAutoTurnIntention: null,
      });
      return NO_PHASE_EFFECTS;
    }

    // ── Battle control ──
    if (prev.type === 'battle') {
      if (action.type === 'battle_set_mode') {
        const runtime = requireBattleRuntimeForPhase(prev);
        GameState.setBattleRuntime({ ...runtime, mode: action.mode, pendingAutoTurnIntention: null });
        return NO_PHASE_EFFECTS;
      }
      if (action.type === 'battle_prepare_quick_battle') {
        const runtime = requireBattleRuntimeForPhase(prev);
        GameState.setBattleRuntime({
          ...runtime,
          turnContext: resetTurnContextForNewBattle(),
          pendingAutoTurnIntention: null,
        });
        return NO_PHASE_EFFECTS;
      }
    }

    // ── Battle preview target ──
    if (prev.type === 'battle' &&
        (action.type === 'battle_preview_target' || action.type === 'battle_clear_preview_target')) {
      const target = action.type === 'battle_preview_target' ? action.target : null;
      const runtime = requireBattleRuntimeForPhase(prev);
      GameState.replaceBattleState(setBattlePreviewTarget(runtime.state, target));
      return NO_PHASE_EFFECTS;
    }

    // ── Battle turn ──
    if (isBattleTurnAction(action) && prev.type === 'battle') {
      const runtime = requireBattleRuntimeForPhase(prev);
      const result = applyBattleTurnAction({
        state:                    runtime.state,
        context:                  runtime.turnContext,
        action,
        mode:                     runtime.mode,
        rng:                      this.rngStreams.battleResolution,
        pendingAutoTurnIntention: runtime.pendingAutoTurnIntention,
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

      // Any turn action invalidates a pending preview target (skill/active unit/targets change).
      GameState.setBattleRuntime({
        ...runtime,
        state: setBattlePreviewTarget(result.state, null),
        turnContext: result.context,
        pendingAutoTurnIntention: nextPendingIntention,
      });
      return { battleFeedback: projectBattleActionFeedback(result) };
    }

    // ── Battle placement ──
    if (isBattlePlacementAction(action) && prev.type === 'battle') {
      const runtime = requireBattleRuntimeForPhase(prev);
      GameState.replaceBattleState(applyBattlePlacementAction(runtime.state, action));
      return NO_PHASE_EFFECTS;
    }

    // ── Campaign init ── always creates a fresh campaign (no idempotent guards); New Game
    // from the menu replaces any existing progress.
    if (action.type === 'new_game') {
      clearDebugSession();
      if (GameState.hasBattleRuntime()) {
        GameState.resetBattleRuntime();
      }
      this.resetGameplayRngStreams();
      GameState.setCampaignState(initCampaignState({
        playerUnits: PLAYER_UNITS,
        itemCatalog: ITEM_CATALOG,
        startingItems: CAMPAIGN_STARTING_ITEMS,
        mapDefinitions: MAP_DEFINITIONS,
        initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
      }));
    }

    // ── Battle start (campaign `enter_battle` and debug `start_battle`) ──
    // Session, source and enemy group all come from the already-resolved battle
    // phase; there is no campaign/debug branching below this point. Party
    // validity was enforced in resolveTransition, so reaching here with an
    // invalid party is a lifecycle error (createBattleRuntimeForSession throws).
    if (action.type === 'enter_battle' || action.type === 'start_battle') {
      if (next.type !== 'battle') {
        throw new Error(`applyActionSideEffects: "${action.type}" must resolve to a battle phase`);
      }
      const session = PlayerSessionStore.getSession(next.sessionSource);
      GameState.setBattleRuntime(createBattleRuntimeForSession({
        session,
        sessionSource: next.sessionSource,
        enemyGroupId:  next.enemyGroupId,
        rng:           this.rngStreams.battleSetup,
      }));
    }

    // ── Replay: one pipeline for campaign and debug ──
    // The source only selects which session to read; replay policy never branches on it.
    // Enemies come from the captured replaySetup, players are re-projected from the
    // current session, and participants are rebuilt for this attempt. Only replaySetup
    // and sessionSource cross the attempt boundary — nothing else from the old runtime.
    if (action.type === 'replay' && prev.type === 'battle') {
      const runtime = requireBattleRuntimeForPhase(prev);
      const session = PlayerSessionStore.getSession(runtime.sessionSource);
      GameState.setBattleRuntime(createReplayBattleRuntimeForSession({
        session,
        replaySetup:   runtime.replaySetup,
        sessionSource: runtime.sessionSource,
      }));
    }

    // ── Battle teardown ──
    if (action.type === 'exit_battle' && prev.type === 'battle') {
      const runtime = requireBattleRuntimeForPhase(prev);

      // One source-neutral roster result, one storage write. No campaign/debug branch.
      applyBattleExitPhaseAction({ runtime, outcome: action.outcome });

      // Campaign-only world consequence — the ONLY sessionSource-keyed branch in teardown.
      // Mark trigger entity dead on the map: victory only; defeat must leave the encounter intact.
      // Immutable replacement: clone entityStates → new SubMapState → new subMapStates →
      // new WorldState → new CampaignState. No in-place mutation of campaign records.
      if (
        action.outcome === 'victory' &&
        runtime.sessionSource === 'campaign' &&
        prev.mapId && prev.triggerPos
      ) {
        const key = `${prev.triggerPos.x},${prev.triggerPos.y}`;
        const c   = GameState.getCampaignState();
        const src = c.world.subMapStates[prev.mapId];
        if (src) {
          const nextMap = { ...src, entityStates: { ...src.entityStates, [key]: { alive: false } } };
          GameState.setCampaignState({
            ...c,
            world: { ...c.world, subMapStates: { ...c.world.subMapStates, [prev.mapId]: nextMap } },
          });
        }
      }
    }

    // ── Item mutations — routed to the session identified by the current phase ──
    if (action.type === 'equip_item' || action.type === 'unequip_item') {
      if (prev.type !== 'equip_screen' && prev.type !== 'debug_equip_screen') return NO_PHASE_EFFECTS;
      const source = prev.sessionSource;
      applyEquipmentPhaseAction({ source, action });
      return NO_PHASE_EFFECTS;
    }

    // ── Camp unit toggle ──
    if (action.type === 'toggle_camp_unit') {
      if (prev.type !== 'camp' && prev.type !== 'debug_equip_screen') return NO_PHASE_EFFECTS;
      applyCampPhaseAction({ source: prev.sessionSource, action });
      return NO_PHASE_EFFECTS;
    }

    // ── Upgrade choice ──
    if (action.type === 'choose_upgrade') {
      if (prev.type !== 'upgrade_tree') return NO_PHASE_EFFECTS;
      applyChooseUpgradePhaseAction({
        source: prev.sessionSource,
        unitTemplateId: prev.unitTemplateId,
        action,
      });
      return NO_PHASE_EFFECTS;
    }

    // ── Debug session lifecycle ──
    // init_debug/reset_debug_session/exit_to_menu may run from a non-battle phase where a
    // battle runtime can't be live (see resolveTransition guards), but the defensive clear
    // keeps this branch correct even if that guard is ever loosened.
    if (action.type === 'init_debug') {
      if (GameState.hasBattleRuntime()) GameState.resetBattleRuntime();
      this.resetGameplayRngStreams();
      const config: DebugSessionConfig = {
        level: action.level,
        startingItems: CAMPAIGN_STARTING_ITEMS,
        initialCampUnitIds: [],
      };
      initializeDebugSession(config);
    }

    if (action.type === 'reset_debug_session') {
      if (GameState.hasBattleRuntime()) GameState.resetBattleRuntime();
      this.resetGameplayRngStreams();
      resetDebugSession();
      return NO_PHASE_EFFECTS;
    }

    if (action.type === 'exit_to_menu') {
      clearDebugSession();
      if (GameState.hasBattleRuntime()) GameState.resetBattleRuntime();
      this.resetGameplayRngStreams();
    }

    // ── move_party: writes CampaignState.world.partyPos, never the phase. ──
    if (action.type === 'move_party') {
      GameState.setCampaignState(applyMovePartyToCampaign(GameState.getCampaignState(), action.partyPos));
    }

    // Fall-through tail for lifecycle actions that intentionally do not early-return
    // (new_game, enter_battle/start_battle, replay, exit_battle, init_debug, exit_to_menu,
    // move_party). None of them produces transient feedback.
    return NO_PHASE_EFFECTS;

    // ── Commerce — commented out until 'shop' phase exists ──
    // if (action.type === 'buy_item') {
    //   const def = ITEM_DEFINITIONS[action.definitionId];
    //   if (def && GameState.money >= def.buyPrice) {
    //     const backpack = GameState.itemContainers['backpack_shared'];
    //     const freeSlot = findFreeBackpackSlotKey(backpack);
    //     if (freeSlot !== null) {
    //       const id = generateItemId(GameState.itemInstances);
    //       GameState.itemInstances[id] = { id, definitionId: def.id };
    //       backpack.slots[freeSlot] = id;
    //       GameState.money -= def.buyPrice;
    //     }
    //   }
    // }

    // if (action.type === 'sell_item') {
    //   const instance = GameState.itemInstances[action.instanceId];
    //   if (instance) {
    //     const def = ITEM_DEFINITIONS[instance.definitionId];
    //     if (def) GameState.money += getSellPrice(def);
    //     for (const container of Object.values(GameState.itemContainers)) {
    //       for (const [slot, id] of Object.entries(container.slots)) {
    //         if (id === action.instanceId) { delete container.slots[slot]; break; }
    //       }
    //     }
    //     delete GameState.itemInstances[action.instanceId];
    //   }
    // }
  }

}

export const PhaseManager = new PhaseManagerClass();
