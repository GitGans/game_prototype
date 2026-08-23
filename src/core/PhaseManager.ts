import { GamePhase, PhaseAction } from './phases';
import type { PhaseSceneSynchronizer } from './phaseSceneSynchronizer';
import type { BattleRuntimeContext } from './battleRuntimeContext';
import type { DebugBattleState, DebugSessionConfig } from './DebugBattleState';
import { initializeDebugSession, resetDebugSession, clearDebugSession } from './debugLifecycle';
import { initCampaignState } from './initCampaignState';
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from '../data/campaignInitialStateDefinition';
import { GameState } from './GameState';
import { EventBus, Events } from './EventBus';
import { MAP_DEFINITIONS } from '../data/mapDefinitions';
import { PLAYER_UNITS } from '../data/units';
import { ITEM_CATALOG } from '../data/itemDefinitions';
import { CAMPAIGN_STARTING_ITEMS } from '../data/startingInventoryDefinitions';
import { projectWorldMapSnapshot, applyMovePartyToCampaign } from './worldMapProjection';
import { wouldMapBeClearedAfterDefeatingMob } from '../world/mapCompletion';
import { resolveTransition } from './phaseTransitionResolver';
import { PlayerSessionStore } from './playerSessionStore';
import { applyEquipmentPhaseAction } from './phaseHandlers/inventoryPhaseHandler';
import { applyCampPhaseAction } from './phaseHandlers/campPhaseHandler';
import { applyChooseUpgradePhaseAction } from './phaseHandlers/progressionPhaseHandler';
import { buildEquipmentScreenPlayerSnapshot } from './equipmentScreenSnapshot';
import { buildRosterCampSnapshot } from './rosterCampSnapshot';
import { buildUpgradeTreePlayerSnapshot } from './upgradeTreeSnapshot';
import { buildBattleResultsSnapshot } from './battleResultsSnapshot';
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
  type BattlePhaseActionResult,
} from './phaseHandlers/battlePhaseHandler';
import {
  buildBattleUnitSnapshotViews,
  buildBattleOccupancySnapshot,
  buildBattleFieldUnitCellsSnapshot,
  projectPreviewTarget,
} from './battleSnapshotBuilder';
import { getActiveSkill } from '../battle/skillRuntime';
import { compileSkillUsePlan } from '../battle/skillPlanCompiler';
import { hasChargedThisRound, resetTurnContextForNewBattle } from '../battle/turnResolver';
import { canBeginCombat } from '../battle/combatStart';
import { createDefaultGameplayRngStreams, type GameplayRngStreams } from './random';

export class PhaseManagerClass {
  private phase: GamePhase = { type: 'main_menu' };
  private sceneSynchronizer: PhaseSceneSynchronizer | null = null;
  private lastBattleTransition: BattlePhaseActionResult | null = null;
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

  private requireBattleRuntime(
    phase: Extract<GamePhase, { type: 'battle' }>,
  ): BattleRuntimeContext {
    const runtime = GameState.getBattleRuntime();
    if (runtime.sessionSource !== phase.sessionSource) {
      throw new Error(
        `Battle runtime/phase sessionSource mismatch: runtime="${runtime.sessionSource}", phase="${phase.sessionSource}"`,
      );
    }
    return runtime;
  }

  getLastBattleTransition(): BattlePhaseActionResult | null {
    return this.lastBattleTransition;
  }

  /** True if winning the current world-map battle would leave no live mobs on the map. */
  private wouldClearMap(battlePhase: GamePhase & { type: 'battle' }): boolean {
    if (battlePhase.sessionSource !== 'campaign' || !battlePhase.mapId || !battlePhase.triggerPos) return false;
    const mapDef = MAP_DEFINITIONS[battlePhase.mapId];
    // mapId/triggerPos are only set for campaign battles (enter_battle), which require an
    // existing campaign — safe to call getCampaignState() unguarded here.
    const mapState = GameState.getCampaignState().world.subMapStates[battlePhase.mapId];
    if (!mapDef || !mapState) return false;
    return wouldMapBeClearedAfterDefeatingMob(mapDef, mapState, battlePhase.triggerPos);
  }

  transition(action: PhaseAction): void {
    let mapCleared = false;
    if (action.type === 'exit_battle' && action.outcome === 'victory' && this.phase.type === 'battle') {
      mapCleared = this.wouldClearMap(this.phase);
    }

    const next = resolveTransition(this.phase, action, { mapCleared });
    if (next === null) {
      this.lastBattleTransition = null;
      return; // invalid action for current phase
    }

    // Navigation precondition: fail before any side effect runs, so a missing
    // init() call never leaves GameState (or this.lastBattleTransition) mutated
    // while `this.phase` is stale.
    const sceneSynchronizer = next !== this.phase ? this.requireSceneSynchronizer() : null;

    this.lastBattleTransition = null;
    this.applyActionSideEffects(action, this.phase, next);

    // Leaving the battle phase always clears the whole runtime atomically — no
    // stale BattleRuntimeContext may survive into battle_results or any other
    // non-battle phase. Entering, replaying, or mutating within battle never
    // triggers this, since `next` stays 'battle' in those cases.
    if (this.phase.type === 'battle' && next !== this.phase && next.type !== 'battle') {
      GameState.resetBattleRuntime();
    }

    if (next === this.phase) {
      // Mutation-only: rebuild snapshot in place, notify scene
      this.phase = this.rebuildSnapshot(this.phase);
      EventBus.emit(Events.STATE_CHANGED);
      return;
    }

    // Navigation: rebuild snapshot for new phase, start scene
    this.phase = this.rebuildSnapshot(next);
    sceneSynchronizer!.sync(this.phase);
  }

  // Recomputes data snapshots for phases that carry them.
  // Called after every applyActionSideEffects so GamePhase is always fresh.
  private rebuildSnapshot(phase: GamePhase): GamePhase {
    switch (phase.type) {
      case 'equip_screen': {
        const session = PlayerSessionStore.getSession(phase.sessionSource);
        const snapshot = buildEquipmentScreenPlayerSnapshot(session, phase.selectedUnitTemplateId);
        return { ...phase, ...snapshot };
      }
      case 'camp': {
        const session = PlayerSessionStore.getSession(phase.sessionSource);
        const { units, selectedForBattleUnitCount, activeLivingUnitCount, canStartBattle } =
          buildRosterCampSnapshot(session.roster);
        return { ...phase, units, selectedForBattleUnitCount, activeLivingUnitCount, canStartBattle };
      }
      case 'debug_equip_screen': {
        const session = PlayerSessionStore.getSession(phase.sessionSource);
        const equipSnapshot = buildEquipmentScreenPlayerSnapshot(session, phase.selectedUnitTemplateId);
        const { campUnitIds, selectedForBattleUnitCount, activeLivingUnitCount, canStartBattle } =
          buildRosterCampSnapshot(session.roster);
        return {
          ...phase, ...equipSnapshot, campUnitIds,
          selectedForBattleUnitCount, activeLivingUnitCount, canStartBattle,
        };
      }
      case 'upgrade_tree': {
        const session = PlayerSessionStore.getSession(phase.sessionSource);
        const { unitName, upgradeTiers } = buildUpgradeTreePlayerSnapshot(session.roster, phase.unitTemplateId);
        return { ...phase, unitName, upgradeTiers };
      }
      case 'battle_results': {
        // Result cards are derived from the roster the exit pipeline just wrote —
        // never from the battle-start participant snapshot.
        const session = PlayerSessionStore.getSession(phase.sessionSource);
        return {
          ...phase,
          units: buildBattleResultsSnapshot(session.roster, phase.participantSeeds),
        };
      }
      case 'battle': {
        const runtime = this.requireBattleRuntime(phase);
        const battleState = runtime.state;

        const { unitsById, fieldUnits, benchUnits } =
          buildBattleUnitSnapshotViews(battleState);
        const occupancy      = buildBattleOccupancySnapshot(battleState);
        const fieldUnitCells = buildBattleFieldUnitCellsSnapshot(battleState);

        // roundQueue is field-only by invariant — look up via fieldUnits to
        // preserve FieldBattleUnitSnapshot typing for activeUnit.
        const fieldById      = new Map(fieldUnits.map(u => [u.id, u]));
        const activeUnitId   = battleState.roundQueue[0] ?? null;
        const activeUnit     = activeUnitId ? (fieldById.get(activeUnitId) ?? null) : null;

        const battleMode     = runtime.mode;
        const activeUnitSide = activeUnit?.side ?? null;

        const manualTurnControlsVisible =
          battleMode === 'manual' && activeUnitSide === 'player';

        const manualChargeDisabled =
          activeUnitId !== null &&
          hasChargedThisRound(runtime.turnContext, activeUnitId);

        let targetHighlightKind:
          | 'target'
          | 'heal_target'
          | 'revive_target'
          | 'none' = 'none';
        if (activeUnit && battleState.validTargets.length > 0) {
          const activeSkill = getActiveSkill(activeUnit);
          const activePlan  = compileSkillUsePlan(activeSkill);
          const policy      = activePlan.targetPolicy;
          switch (policy.type) {
            case 'enemy_melee':
            case 'enemy_ranged':
              targetHighlightKind = 'target';
              break;
            case 'alive_friendly':
            case 'self':
              targetHighlightKind = 'heal_target';
              break;
            case 'dead_friendly':
              targetHighlightKind = 'revive_target';
              break;
            default: {
              const _exhaustive: never = policy;
              targetHighlightKind = _exhaustive;
            }
          }
        }

        const { previewTargetCoord, previewTargetUnitId } = projectPreviewTarget({
          battlePhase:         battleState.phase,
          previewTargetCoord:  battleState.previewTargetCoord,
          validTargets:        battleState.validTargets,
          hasActiveUnit:       activeUnit !== null,
          fieldUnitCells,
          unitsById,
          targetHighlightKind,
        });

        // participants = battle-start snapshot; do NOT rebuild from current placement state.
        // Copied, not aliased: GamePhase is a render projection, never a handle onto
        // runtime-owned mutable data.
        return {
          ...phase,
          participants:        runtime.participants.map(p => ({ ...p })),
          benchUnits,
          placementSelection:  battleState.placementSelection,
          battlePhase:         battleState.phase,
          canBeginCombat:      canBeginCombat(battleState),
          fieldUnits,
          unitsById,
          occupancy,
          fieldUnitCells,
          roundQueue:          [...battleState.roundQueue],
          activeUnitId,
          activeUnit,
          battleMode,
          activeUnitSide,
          manualTurnControlsVisible,
          manualChargeDisabled,
          validTargets:        battleState.validTargets.map(c => ({ ...c })),
          targetHighlightKind,
          previewTargetCoord,
          previewTargetUnitId,
        };
      }
      case 'world_map': {
        // CampaignState.world is authoritative — mapId/partyPos/mapState here are always
        // overwritten from it, never trusted from the incoming phase.
        return { ...phase, ...projectWorldMapSnapshot(GameState.getCampaignState()) };
      }
      default:
        return phase; // phases without snapshots pass through unchanged
    }
  }

  refreshSnapshot(): void {
    this.phase = this.rebuildSnapshot(this.phase);
  }

  private applyActionSideEffects(
    action: PhaseAction,
    prev: GamePhase,
    next: GamePhase,
  ): void {
    // ── Battle lifecycle ──
    if (isBattleLifecycleAction(action) && prev.type === 'battle') {
      const runtime = this.requireBattleRuntime(prev);
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
      return;
    }

    // ── Battle control ──
    if (prev.type === 'battle') {
      if (action.type === 'battle_set_mode') {
        const runtime = this.requireBattleRuntime(prev);
        GameState.setBattleRuntime({ ...runtime, mode: action.mode, pendingAutoTurnIntention: null });
        return;
      }
      if (action.type === 'battle_prepare_quick_battle') {
        const runtime = this.requireBattleRuntime(prev);
        GameState.setBattleRuntime({
          ...runtime,
          turnContext: resetTurnContextForNewBattle(),
          pendingAutoTurnIntention: null,
        });
        return;
      }
    }

    // ── Battle preview target ──
    if (prev.type === 'battle' &&
        (action.type === 'battle_preview_target' || action.type === 'battle_clear_preview_target')) {
      const target = action.type === 'battle_preview_target' ? action.target : null;
      const runtime = this.requireBattleRuntime(prev);
      GameState.replaceBattleState(setBattlePreviewTarget(runtime.state, target));
      return;
    }

    // ── Battle turn ──
    if (isBattleTurnAction(action) && prev.type === 'battle') {
      const runtime = this.requireBattleRuntime(prev);
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
      this.lastBattleTransition = result;
      return;
    }

    // ── Battle placement ──
    if (isBattlePlacementAction(action) && prev.type === 'battle') {
      const runtime = this.requireBattleRuntime(prev);
      GameState.replaceBattleState(applyBattlePlacementAction(runtime.state, action));
      return;
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
      const runtime = this.requireBattleRuntime(prev);
      const session = PlayerSessionStore.getSession(runtime.sessionSource);
      GameState.setBattleRuntime(createReplayBattleRuntimeForSession({
        session,
        replaySetup:   runtime.replaySetup,
        sessionSource: runtime.sessionSource,
      }));
    }

    // ── Battle teardown ──
    if (action.type === 'exit_battle' && prev.type === 'battle') {
      const runtime = this.requireBattleRuntime(prev);

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
      if (prev.type !== 'equip_screen' && prev.type !== 'debug_equip_screen') return;
      const source = prev.sessionSource;
      applyEquipmentPhaseAction({ source, action });
      return;
    }

    // ── Camp unit toggle ──
    if (action.type === 'toggle_camp_unit') {
      if (prev.type !== 'camp' && prev.type !== 'debug_equip_screen') return;
      applyCampPhaseAction({ source: prev.sessionSource, action });
      return;
    }

    // ── Upgrade choice ──
    if (action.type === 'choose_upgrade') {
      if (prev.type !== 'upgrade_tree') return;
      applyChooseUpgradePhaseAction({
        source: prev.sessionSource,
        unitTemplateId: prev.unitTemplateId,
        action,
      });
      return;
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
      return;
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
