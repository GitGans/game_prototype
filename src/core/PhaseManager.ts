import Phaser from 'phaser';
import { GamePhase, PhaseAction, EMPTY_BACKPACK_SNAPSHOT, EMPTY_EQUIP_SNAPSHOT } from './phases';
import type { BattleParticipant, BattleRuntimeContext } from './battleRuntimeContext';
import {
  createEmptyBattleState,
  createBattleRuntimeContext,
  restartBattleRuntime,
} from './battleRuntimeContext';
import type { DebugBattleState, DebugSessionConfig } from './DebugBattleState';
import { createDebugPlayerSession } from './debugPlayerSession';
import { initCampaignState } from './initCampaignState';
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from '../data/campaignInitialStateDefinition';
import { GameState } from './GameState';
import { EventBus, Events } from './EventBus';
import { MAP_DEFINITIONS } from '../data/mapDefinitions';
import { PLAYER_UNITS } from '../data/units';
import { ITEM_CATALOG } from '../data/itemDefinitions';
import { CAMPAIGN_STARTING_ITEMS } from '../data/startingInventoryDefinitions';
import { SubMapDefinition, SubMapState } from '../world/types';
import { projectWorldMapSnapshot, applyMovePartyToCampaign } from './worldMapProjection';
import { resolveBattleExitRoute } from './battleExitRouting';
import { PlayerSessionStore } from './playerSessionStore';
import { applyEquipmentPhaseAction } from './phaseHandlers/inventoryPhaseHandler';
import { applyCampPhaseAction } from './phaseHandlers/campPhaseHandler';
import { applyChooseUpgradePhaseAction } from './phaseHandlers/progressionPhaseHandler';
import { buildEquipmentScreenPlayerSnapshot } from './equipmentScreenSnapshot';
import { buildRosterCampSnapshot } from './rosterCampSnapshot';
import { buildUpgradeTreePlayerSnapshot } from './upgradeTreeSnapshot';
import {
  BattleState,
  Unit,
} from '../battle/types';
import { isAlive } from '../battle/lifeState';
import {
  applyBattleExitPlayerPersistence,
  applyVictoryLevelUpPersistence,
  type PlayerLevelUpInput,
} from './playerUnitPersistence';
import { buildPlayerExitInputs } from './playerBattleExitProjection';
import { resolvePlayerMaxHpForLevel } from './battleSetupProjection';
import type { UnitBlueprint } from '../shared/unitTypes';
import type { PlayerUnitState } from '../progression';
import type { PlayerBattleSetup } from './battleSetup';
import {
  buildNewBattleState,
  buildReplayBattleState,
} from './battleInitialization';
import {
  isBattlePlacementAction,
  applyBattlePlacementAction,
  isBattleTurnAction,
  applyBattleTurnAction,
  isBattleLifecycleAction,
  applyBattleLifecycleAction,
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
import { resolveUnitProgression, type ResolvedUnitProgression } from '../progression';
import { getUnitSpriteTextureKey } from './unitSpriteKey';
import { resolvePlayerUnitSpriteSheet } from './unitSprites';
import { createDefaultGameplayRngStreams, type GameplayRngStreams } from './random';

class PhaseManagerClass {
  private phase: GamePhase = { type: 'main_menu' };
  private game!: Phaser.Game;
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

  init(game: Phaser.Game): void {
    this.game = game;
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  getDebugState(): DebugBattleState | null {
    return GameState.getDebugState();
  }

  getActiveBattleSetup(): PlayerBattleSetup {
    if (this.phase.type === 'battle' && this.phase.sessionSource === 'debug') {
      return this.buildDebugBattleSetup();
    }
    const campaign = GameState.getCampaignState();
    return {
      playerUnits:    campaign.roster.units,
      itemContainers: campaign.inventory.containers,
      itemInstances:  campaign.inventory.instances,
    };
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

  /** Pure adapter — never reconstructs PlayerUnitState records. Deleted in Stage 3. */
  buildDebugBattleSetup(): PlayerBattleSetup {
    const ds = GameState.requireDebugState();
    return {
      playerUnits:    ds.session.roster.units,
      itemContainers: ds.session.inventory.containers,
      itemInstances:  ds.session.inventory.instances,
    };
  }

  getLastBattleTransition(): BattlePhaseActionResult | null {
    return this.lastBattleTransition;
  }

  transition(action: PhaseAction): void {
    this.lastBattleTransition = null;
    let mapCleared = false;
    if (action.type === 'exit_battle' && action.outcome === 'victory' && this.phase.type === 'battle') {
      mapCleared = wouldClearMap(this.phase);
    }

    // Derive exit participants here, outside resolveTransition, to keep it pure.
    // Derived for both victory and defeat — Stage 5 persistence runs on both.
    let exitParticipants: BattleParticipant[] = [];
    if (action.type === 'exit_battle' && this.phase.type === 'battle') {
      exitParticipants = this.buildExitParticipants();
    }

    const next = resolveTransition(this.phase, action, mapCleared, exitParticipants);
    if (next === null) return; // invalid action for current phase

    this.applyActionSideEffects(action, this.phase, exitParticipants);

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
    this.syncPhaserScenes(this.phase);
  }

  private spriteKeyFromProgression(
    blueprint:   UnitBlueprint,
    progression: ResolvedUnitProgression,
  ): string | null {
    const sheet = resolvePlayerUnitSpriteSheet(blueprint, progression);
    return sheet ? getUnitSpriteTextureKey(blueprint.templateId, sheet) : null;
  }

  // Builds the battle-start participant snapshot. `wasOnBench` is derived from
  // `state.deployments` at this moment — i.e., the initial deployment — and must
  // not be recomputed later. Callers must invoke this immediately after
  // `buildNewBattleState(...)` and before any placement actions can run.
  private buildBattleParticipantsFromInitialState(state: BattleState): BattleParticipant[] {
    const participants: BattleParticipant[] = [];
    Object.entries(GameState.getCampaignState().roster.units).forEach(([templateId, us]) => {
      if (us.isInCamp) return;
      const bp = PLAYER_UNITS.find(b => b.templateId === templateId);
      if (!bp) return;
      const runtimeUnit = [...state.units.values()].find(
        u => u.side === 'player' && u.templateId === templateId,
      );
      if (!runtimeUnit) return;
      const dep         = state.deployments.get(runtimeUnit.id);
      const wasOnBench  = dep?.kind === 'bench';
      const progression = resolveUnitProgression(bp, us.chosenUpgrades ?? {});
      const spriteKey   = this.spriteKeyFromProgression(bp, progression);
      participants.push({
        templateId, name: bp.name, level: us.level,
        isAlive: true, wasOnBench, spriteKey,
      });
    });
    return participants;
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
        const { units, activeLivingUnitCount, canStartBattle } = buildRosterCampSnapshot(session.roster);
        return { ...phase, units, activeLivingUnitCount, canStartBattle };
      }
      case 'debug_equip_screen': {
        const session = PlayerSessionStore.getSession(phase.sessionSource);
        const equipSnapshot = buildEquipmentScreenPlayerSnapshot(session, phase.selectedUnitTemplateId);
        const { campUnitIds, activeLivingUnitCount, canStartBattle } = buildRosterCampSnapshot(session.roster);
        return { ...phase, ...equipSnapshot, campUnitIds, activeLivingUnitCount, canStartBattle };
      }
      case 'upgrade_tree': {
        const session = PlayerSessionStore.getSession(phase.sessionSource);
        const { unitName, upgradeTiers } = buildUpgradeTreePlayerSnapshot(session.roster, phase.unitTemplateId);
        return { ...phase, unitName, upgradeTiers };
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

  private applyActionSideEffects(action: PhaseAction, prev: GamePhase, exitParticipants: BattleParticipant[] = []): void {
    // ── Battle lifecycle ──
    if (isBattleLifecycleAction(action) && prev.type === 'battle') {
      const runtime = this.requireBattleRuntime(prev);
      const result = applyBattleLifecycleAction({ state: runtime.state, action });

      if (result.persistCampaignPlacements && runtime.sessionSource === 'campaign') {
        const units = { ...GameState.getCampaignState().roster.units };
        let changed = false;
        for (const unit of runtime.state.units.values()) {
          if (unit.side !== 'player') continue;
          const deployment = runtime.state.deployments.get(unit.id);
          if (deployment?.kind !== 'field') continue; // bench units have no field placement to save
          const unitState = units[unit.templateId];
          if (!unitState) continue;
          units[unit.templateId] = { ...unitState, lastPlacement: deployment.anchor };
          changed = true;
        }
        if (changed) GameState.replaceCampaignRoster({ units });
      }

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
      this.rngStreams = createDefaultGameplayRngStreams();
      GameState.setCampaignState(initCampaignState({
        playerUnits: PLAYER_UNITS,
        itemCatalog: ITEM_CATALOG,
        startingItems: CAMPAIGN_STARTING_ITEMS,
        mapDefinitions: MAP_DEFINITIONS,
        initialState: CAMPAIGN_INITIAL_STATE_DEFINITION,
      }));
    }

    // ── Campaign battle: initialize BattleRuntimeContext ──
    if (action.type === 'enter_battle') {
      const setup = this.getActiveBattleSetup();
      const emptyState = createEmptyBattleState();
      const { state, enemyPlacements } = buildNewBattleState(
        emptyState, setup, action.enemyGroupId, this.rngStreams.battleSetup,
      );
      const participants = this.buildBattleParticipantsFromInitialState(state);

      GameState.setBattleRuntime(createBattleRuntimeContext({
        state,
        participants,
        replaySetup: { enemyGroupId: action.enemyGroupId, enemyPlacements },
        sessionSource: 'campaign',
      }));
    }

    // ── Debug battle: initialize BattleRuntimeContext ──
    // Invariant: debug battles never save or replay enemy placements across sessions.
    if (action.type === 'start_battle') {
      const setup = this.buildDebugBattleSetup();
      const emptyState = createEmptyBattleState();
      const { state, enemyPlacements } = buildNewBattleState(
        emptyState, setup, action.enemyGroupId, this.rngStreams.battleSetup,
      );

      // Snapshot debug participants (all non-camp units; bench not tracked for debug).
      // Each unit's own level/chosenUpgrades — never a session-wide "shared" value.
      const participants: BattleParticipant[] = [];
      for (const bp of PLAYER_UNITS) {
        const us = setup.playerUnits[bp.templateId];
        if (!us || us.isInCamp) continue;
        const progression = resolveUnitProgression(bp, us.chosenUpgrades ?? {});
        const spriteKey   = this.spriteKeyFromProgression(bp, progression);
        participants.push({ templateId: bp.templateId, name: bp.name, level: us.level, isAlive: true, wasOnBench: false, spriteKey });
      }

      GameState.setBattleRuntime(createBattleRuntimeContext({
        state,
        participants,
        replaySetup: { enemyGroupId: action.enemyGroupId, enemyPlacements },
        sessionSource: 'debug',
      }));
    }

    // ── Replay: reinstall a complete BattleRuntimeContext ──
    if (action.type === 'replay' && prev.type === 'battle') {
      const runtime = this.requireBattleRuntime(prev);

      if (runtime.sessionSource === 'debug') {
        // Debug replay = fresh battle. Intentional: debug battles have no saved placements.
        const setup = this.buildDebugBattleSetup();
        const emptyState = createEmptyBattleState();
        const { state, enemyPlacements } = buildNewBattleState(
          emptyState, setup, runtime.replaySetup.enemyGroupId, this.rngStreams.battleSetup,
        );
        GameState.setBattleRuntime(restartBattleRuntime(runtime, state, {
          enemyGroupId: runtime.replaySetup.enemyGroupId,
          enemyPlacements,
        }));
      } else {
        // Normal case: replay same enemies in same positions
        const setup = this.getActiveBattleSetup();
        const emptyState = createEmptyBattleState();
        const replayState = buildReplayBattleState(emptyState, setup, runtime.replaySetup.enemyPlacements);
        GameState.setBattleRuntime(restartBattleRuntime(runtime, replayState, runtime.replaySetup));
      }
    }

    // ── Battle teardown ──
    if (action.type === 'exit_battle' && prev.type === 'battle') {
      const runtime = this.requireBattleRuntime(prev);
      const route = resolveBattleExitRoute(runtime.sessionSource, GameState.getDebugState());
      if (route.source === 'debug') {
        const debugState = route.debugState;
        // Debug teardown: XP goes to DebugBattleState only — never touches CampaignState.
        // Temporary Stage 1 behavior: bump every debug unit's level by one (preserves the
        // old shared-level visible behavior). initialConfig.level is never touched.
        if (action.outcome === 'victory') {
          const units: Record<string, PlayerUnitState> = {};
          for (const [templateId, us] of Object.entries(debugState.session.roster.units)) {
            units[templateId] = { ...us, level: us.level + 1 };
          }
          GameState.replaceDebugSession({ ...debugState.session, roster: { units } });
        }
      } else {
        const exits = buildPlayerExitInputs(exitParticipants, runtime.state);

        GameState.replaceCampaignRoster({
          units: applyBattleExitPlayerPersistence(GameState.getCampaignState().roster.units, exits),
        });

        if (action.outcome === 'victory') {
          this.applyVictoryLevelUp(exitParticipants);
        }

        // Mark trigger entity dead on the map — victory only; defeat must leave the encounter intact.
        // Immutable replacement: clone entityStates → new SubMapState → new subMapStates →
        // new WorldState → new CampaignState. No in-place mutation of campaign records.
        // INVARIANT: action.outcome === 'victory' is required before mutating entityStates.
        if (action.outcome === 'victory' && prev.mapId && prev.triggerPos) {
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

    // ── Debug mode ──
    if (action.type === 'init_debug') {
      const config: DebugSessionConfig = {
        level: action.level,
        startingItems: CAMPAIGN_STARTING_ITEMS,
        initialCampUnitIds: [],
      };
      const session = createDebugPlayerSession({ config, playerUnits: PLAYER_UNITS, itemCatalog: ITEM_CATALOG });
      GameState.setDebugState({ session, initialConfig: config });
      this.rngStreams = createDefaultGameplayRngStreams();
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

  private readonly GAME_SCENES = ['MainMenu', 'WorldMap', 'Prep', 'Game', 'BattleResults', 'EquipScreen', 'DebugLevelSelect', 'UpgradeTreeScreen', 'MapVictory'];

  private syncPhaserScenes(phase: GamePhase): void {
    const sm = this.game.scene;
    let nextScene: string;
    switch (phase.type) {
      case 'main_menu':         nextScene = 'MainMenu';         break;
      case 'world_map':         nextScene = 'WorldMap';         break;
      case 'battle':            nextScene = 'Game';             break;
      case 'camp':              nextScene = 'Prep';             break;
      case 'battle_results':    nextScene = 'BattleResults';    break;
      case 'equip_screen':      nextScene = 'EquipScreen';      break;
      case 'debug_equip_screen':nextScene = 'EquipScreen';      break;
      case 'debug_level_select':nextScene = 'DebugLevelSelect'; break;
      case 'upgrade_tree':      nextScene = 'UpgradeTreeScreen'; break;
      case 'map_victory':       nextScene = 'MapVictory';        break;
      default: return;
    }
    for (const key of this.GAME_SCENES) {
      if (key !== nextScene && (sm.isActive(key) || sm.isPaused(key))) sm.stop(key);
    }
    sm.start(nextScene);
  }

  private applyVictoryLevelUp(exitParticipants: BattleParticipant[]): void {
    const campaign = GameState.getCampaignState();
    const levelUps: PlayerLevelUpInput[] = [];
    for (const p of exitParticipants) {
      const us = campaign.roster.units[p.templateId];
      if (!us) continue;
      const bp = PLAYER_UNITS.find(b => b.templateId === p.templateId);
      if (!bp) continue;

      const newLevel = us.level + 1;
      const newMaxHp = resolvePlayerMaxHpForLevel({
        blueprint:        bp,
        level:            newLevel,
        chosenUpgrades:   us.chosenUpgrades ?? {},
        permanentBonuses: us.permanentBonuses ?? {},
        itemContainers:   campaign.inventory.containers,
        itemInstances:    campaign.inventory.instances,
      });

      levelUps.push({ templateId: p.templateId, newLevel, newMaxHp });
    }

    GameState.replaceCampaignRoster({
      units: applyVictoryLevelUpPersistence(GameState.getCampaignState().roster.units, levelUps),
    });
  }

  private buildExitParticipants(): BattleParticipant[] {
    const phase = this.phase;
    if (phase.type !== 'battle') return [];
    const runtime = this.requireBattleRuntime(phase);

    const runtimePlayerByTemplateId = new Map<string, Unit>();
    for (const u of runtime.state.units.values()) {
      if (u.side !== 'player') continue;
      if (runtimePlayerByTemplateId.has(u.templateId)) {
        throw new Error(
          `[Stage5] Duplicate runtime player unit for templateId="${u.templateId}". ` +
          `Campaign roster invariant violated.`,
        );
      }
      runtimePlayerByTemplateId.set(u.templateId, u);
    }

    return runtime.participants.map(pp => {
      const runtimeUnit = runtimePlayerByTemplateId.get(pp.templateId);
      if (runtimeUnit) {
        // Runtime state wins over wasOnBench. A bench-origin unit that was
        // moved to field during placement and then died is reported dead.
        return { ...pp, isAlive: isAlive(runtimeUnit) };
      }
      // Fallback: no runtime unit. Treat wasOnBench-origin participants as
      // alive (they could not have taken battle damage); otherwise dead.
      return { ...pp, isAlive: pp.wasOnBench };
    });
  }
}

// ─── Pure transition logic — no Phaser imports, no GameState access ───────────

export function resolveTransition(current: GamePhase, action: PhaseAction, mapCleared = false, derivedExitParticipants: BattleParticipant[] = []): GamePhase | null {
  switch (action.type) {

    case 'new_game':
      // Placeholder — immediately superseded by rebuildSnapshot's world_map case, which reads
      // the freshly-created CampaignState (set in applyActionSideEffects, which runs first).
      return { type: 'world_map', mapId: '', partyPos: { x: 0, y: 0 }, mapState: { entityStates: {} } };

    case 'debug':
      return { type: 'debug_level_select' };

    case 'init_debug':
      return {
        type: 'debug_equip_screen',
        sessionSource: 'debug',
        selectedUnitTemplateId: '',
        selectedUnitSpriteKey: null,          // filled by rebuildSnapshot
        selectedUnit: null,                   // filled by rebuildSnapshot
        availableUnits: [],
        backpack: EMPTY_BACKPACK_SNAPSHOT,
        unitEquipment: EMPTY_EQUIP_SNAPSHOT,
        unitStats: null,
        campUnitIds: [],
        activeLivingUnitCount: 0,
        canStartBattle: false,
        learnedSkills: [],
        upgradeSkills: [],
      };

    case 'switch_debug_unit':
      if (current.type !== 'debug_equip_screen') return null;
      return { ...current, selectedUnitTemplateId: action.templateId };

    case 'move_party':
      if (current.type !== 'world_map') return null;
      return current; // mutation-only — position lives in CampaignState.world, not the phase

    case 'enter_battle':
      if (current.type !== 'world_map') return null;
      return {
        type:               'battle',
        sessionSource:      'campaign',
        enemyGroupId:       action.enemyGroupId,
        returnPhase:        current,
        triggerPos:         action.triggerPos,
        mapId:              current.mapId,
        participants:       [],                                                       // filled by rebuildSnapshot
        benchUnits:         [],                                                       // filled by rebuildSnapshot
        placementSelection: { selectedBenchUnitId: null, selectedFieldUnitId: null }, // filled by rebuildSnapshot
        battlePhase:         'placement',
        fieldUnits:          [],
        unitsById:           new Map(),
        occupancy:           { cellToUnitId: new Map(), unitToCells: new Map() },
        fieldUnitCells:      { cellToUnitIds: new Map(), unitToCells: new Map() },
        roundQueue:          [],
        activeUnitId:        null,
        activeUnit:          null,
        battleMode:               'manual',                                           // filled by rebuildSnapshot
        activeUnitSide:           null,                                               // filled by rebuildSnapshot
        manualTurnControlsVisible: false,                                             // filled by rebuildSnapshot
        manualChargeDisabled:     false,                                              // filled by rebuildSnapshot
        validTargets:        [],
        targetHighlightKind: 'none',
        previewTargetCoord:  null,
        previewTargetUnitId: null,
      };

    case 'enter_camp':
      if (current.type !== 'world_map') return null;
      return {
        type: 'camp',
        sessionSource: 'campaign',
        returnPhase: current,
        units: [],
        activeLivingUnitCount: 0,
        canStartBattle: false,
      };

    case 'exit_camp':
      if (current.type !== 'camp') return null;
      return current.returnPhase;

    case 'start_battle':
      if (current.type !== 'debug_equip_screen') return null;
      return {
        type:               'battle',
        sessionSource:      'debug',
        enemyGroupId:       action.enemyGroupId,
        returnPhase:        current,
        participants:       [],                                                       // filled by rebuildSnapshot
        benchUnits:         [],                                                       // filled by rebuildSnapshot
        placementSelection: { selectedBenchUnitId: null, selectedFieldUnitId: null }, // filled by rebuildSnapshot
        battlePhase:         'placement',
        fieldUnits:          [],
        unitsById:           new Map(),
        occupancy:           { cellToUnitId: new Map(), unitToCells: new Map() },
        fieldUnitCells:      { cellToUnitIds: new Map(), unitToCells: new Map() },
        roundQueue:          [],
        activeUnitId:        null,
        activeUnit:          null,
        battleMode:               'manual',                                           // filled by rebuildSnapshot
        activeUnitSide:           null,                                               // filled by rebuildSnapshot
        manualTurnControlsVisible: false,                                             // filled by rebuildSnapshot
        manualChargeDisabled:     false,                                              // filled by rebuildSnapshot
        validTargets:        [],
        targetHighlightKind: 'none',
        previewTargetCoord:  null,
        previewTargetUnitId: null,
      };

    case 'exit_battle':
      if (current.type !== 'battle') return null;
      if (action.outcome === 'defeat') return current.returnPhase;
      return {
        type: 'battle_results',
        units: derivedExitParticipants.map(p => ({ ...p, newLevel: p.level + 1 })),
        returnPhase: current.returnPhase,
        mapCleared,
      };

    case 'exit_results':
      if (current.type !== 'battle_results') return null;
      if (current.mapCleared && current.returnPhase.type === 'world_map') {
        return { type: 'map_victory', mapId: current.returnPhase.mapId };
      }
      return current.returnPhase;

    case 'replay':
      if (current.type !== 'battle') return null;
      return { ...current };

    case 'exit_to_menu':
      return { type: 'main_menu' };

    // ── Equip screen navigation ──────────────────────────────────────────────

    case 'open_equip_screen':
      if (current.type !== 'world_map' && current.type !== 'camp') return null;
      return {
        type: 'equip_screen',
        sessionSource: 'campaign',
        selectedUnitTemplateId: action.unitTemplateId,
        selectedUnitSpriteKey: null,          // filled by rebuildSnapshot
        selectedUnit: null,                   // filled by rebuildSnapshot
        returnPhase: current,
        backpack: EMPTY_BACKPACK_SNAPSHOT,    // filled by rebuildSnapshot
        unitEquipment: EMPTY_EQUIP_SNAPSHOT,  // filled by rebuildSnapshot
        availableUnits: [],                   // filled by rebuildSnapshot
        unitStats: null,                      // filled by rebuildSnapshot
        learnedSkills: [],                    // filled by rebuildSnapshot
        upgradeSkills: [],                    // filled by rebuildSnapshot
      };

    case 'close_equip_screen':
      if (current.type === 'equip_screen') return current.returnPhase;
      if (current.type === 'debug_equip_screen') return { ...current, selectedUnitTemplateId: '' };
      return null;

    case 'switch_equip_unit':
      if (current.type !== 'equip_screen') return null;
      // Returns new object → triggers rebuildSnapshot for new unit's equipment
      return { ...current, selectedUnitTemplateId: action.templateId };

    // ── Mutation-only — return same reference → rebuildSnapshot + STATE_CHANGED ──

    case 'equip_item':
      if (current.type !== 'equip_screen' && current.type !== 'debug_equip_screen') return null;
      return current;

    case 'unequip_item':
      if (current.type !== 'equip_screen' && current.type !== 'debug_equip_screen') return null;
      return current;

    // ── Upgrade tree navigation ──────────────────────────────────────────────
    case 'open_upgrade_tree': {
      if (current.type !== 'equip_screen' && current.type !== 'debug_equip_screen') return null;
      return {
        type: 'upgrade_tree',
        sessionSource: current.sessionSource,
        unitTemplateId: current.selectedUnitTemplateId,
        unitName: '',        // filled by rebuildSnapshot via buildUpgradeTreePlayerSnapshot
        returnPhase: current,
        upgradeTiers: [],    // filled by rebuildSnapshot
      };
    }

    case 'close_upgrade_tree':
      if (current.type !== 'upgrade_tree') return null;
      return current.returnPhase;

    // ── Upgrade choice (mutation-only) ───────────────────────────────────────
    case 'choose_upgrade':
      if (current.type !== 'upgrade_tree') return null;
      return current; // mutation-only → rebuildSnapshot refreshes upgrade tiers

    // ── Camp unit toggle (mutation-only) ─────────────────────────────────────
    case 'toggle_camp_unit':
      if (current.type !== 'camp' && current.type !== 'debug_equip_screen') return null;
      return current; // mutation-only → rebuildSnapshot refreshes camp/campUnitIds/activeLivingUnitCount

    // ── Commerce — stub until 'shop' phase exists ────────────────────────────
    case 'buy_item':
    case 'sell_item':
      return null; // no shop phase yet

    // ── Battle lifecycle (mutation-only) ─────────────────────────────────────
    case 'battle_begin_combat':
    case 'battle_mark_quick_battle_complete':
      if (current.type !== 'battle') return null;
      return current;

    // ── Battle control (mutation-only) ───────────────────────────────────────
    case 'battle_set_mode':
    case 'battle_prepare_quick_battle':
      if (current.type !== 'battle') return null;
      return current;

    // ── Battle placement (mutation-only) ─────────────────────────────────────
    case 'select_bench_slot':
    case 'select_field_unit':
    case 'clear_placement_selection':
    case 'place_bench_unit':
    case 'swap_bench_with_field':
    case 'move_field_unit':
    case 'move_field_unit_to_bench':
    case 'return_field_unit_to_bench':
    case 'swap_field_units':
      if (current.type !== 'battle') return null;
      return current; // applyActionSideEffects mutates BattleState; rebuildSnapshot refreshes phase

    // ── Battle turn (mutation-only) ───────────────────────────────────────
    case 'battle_start_turn':
    case 'battle_select_skill':
    case 'battle_use_skill':
    case 'battle_advance_turn':
    case 'battle_skip_turn':
    case 'battle_charge_turn':
    case 'battle_quick_turn':
    case 'battle_decide_auto_turn':
    case 'battle_apply_auto_turn':
      if (current.type !== 'battle') return null;
      return current; // applyActionSideEffects mutates state; rebuildSnapshot refreshes phase

    // ── Battle preview target (mutation-only) ──────────────────────────────
    case 'battle_preview_target':
    case 'battle_clear_preview_target':
      if (current.type !== 'battle') return null;
      return current; // applyActionSideEffects mutates BattleState; rebuildSnapshot refreshes phase
  }
}

function allMobsDead(mapDef: SubMapDefinition, mapState: SubMapState): boolean {
  for (let row = 0; row < mapDef.layout.length; row++) {
    for (let col = 0; col < mapDef.layout[row].length; col++) {
      const cell = mapDef.layout[row][col];
      if (cell && typeof cell === 'object' && cell.type === 'mob') {
        const key = `${col},${row}`;
        if (mapState.entityStates[key]?.alive !== false) return false;
      }
    }
  }
  return true;
}

/** True if winning the current world-map battle would leave no live mobs on the map. */
function wouldClearMap(battlePhase: GamePhase & { type: 'battle' }): boolean {
  if (battlePhase.sessionSource !== 'campaign' || !battlePhase.mapId || !battlePhase.triggerPos) return false;
  const mapDef   = MAP_DEFINITIONS[battlePhase.mapId];
  // mapId/triggerPos are only set for campaign battles (enter_battle), which require an
  // existing campaign — safe to call getCampaignState() unguarded here.
  const mapState = GameState.getCampaignState().world.subMapStates[battlePhase.mapId];
  if (!mapDef || !mapState) return false;

  const key = `${battlePhase.triggerPos.x},${battlePhase.triggerPos.y}`;
  const virtualEntityStates = { ...mapState.entityStates, [key]: { alive: false } };
  const virtualMapState: SubMapState = { ...mapState, entityStates: virtualEntityStates };

  return allMobsDead(mapDef, virtualMapState);
}

export const PhaseManager = new PhaseManagerClass();
