import Phaser from 'phaser';
import { GamePhase, PhaseAction, CampUnitSnapshot, SkillIconSnapshot, UpgradeTierSnapshot, UpgradeOptionSnapshot, EMPTY_BACKPACK_SNAPSHOT, EMPTY_EQUIP_SNAPSHOT, BattleParticipant } from './phases';
import type { DebugBattleState, DebugSessionConfig } from './DebugBattleState';
import { createDebugPlayerSession } from './debugPlayerSession';
import { initCampaignState } from './initCampaignState';
import { CAMPAIGN_INITIAL_STATE_DEFINITION } from '../data/campaignInitialStateDefinition';
import { GameState } from './GameState';
import { EventBus, Events } from './EventBus';
import { MAP_DEFINITIONS } from '../data/mapDefinitions';
import { PLAYER_UNITS } from '../data/units';
import { ITEM_CATALOG, ITEM_DEFINITIONS } from '../data/itemDefinitions';
import { CAMPAIGN_STARTING_ITEMS } from '../data/startingInventoryDefinitions';
import { SubMapDefinition, SubMapState } from '../world/types';
import { projectWorldMapSnapshot, applyMovePartyToCampaign } from './worldMapProjection';
import {
  equipItem,
  unequipItem,
  buildBackpackSnapshot,
  buildEquipmentSnapshot,
} from '../inventory';
import type { EquipSlot } from '../shared/itemTypes';
import {
  UnitTabSnapshot,
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
import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';
import type { UnitBlueprint } from '../shared/unitTypes';
import type { PlayerUnitState } from '../progression';
import { buildSkillIconSnapshot, buildUnitUpgradeStatLines } from './unitUpgradePresentation';
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
  type AutoTurnIntention,
} from './phaseHandlers/battlePhaseHandler';
import {
  buildBattleUnitSnapshotViews,
  buildBattleOccupancySnapshot,
  buildBattleFieldUnitCellsSnapshot,
  projectPreviewTarget,
} from './battleSnapshotBuilder';
import { getActiveSkill } from '../battle/skillRuntime';
import { compileSkillUsePlan } from '../battle/skillPlanCompiler';
import { hasChargedThisRound } from '../battle/turnResolver';
import { resolveUnitProgression, type ResolvedUnitProgression, type UnitUpgradeChoices } from '../progression';
import { resolveSkillDefinition, resolveUnitClassDefinition } from '../progression';
import { buildUnitStatsSnapshot } from './unitStatsSnapshot';
import { getUnitSpriteTextureKey } from './unitSpriteKey';
import { resolvePlayerUnitSpriteSheet, resolvePlayerUpgradeSpriteSheet } from './unitSprites';
import { createDefaultGameplayRngStreams, type GameplayRngStreams } from './random';

function toSkillIcon(skill: ActionSkillDefinition): SkillIconSnapshot {
  return buildSkillIconSnapshot(skill);
}

class PhaseManagerClass {
  private phase: GamePhase = { type: 'main_menu' };
  private game!: Phaser.Game;
  private lastBattleTransition:     BattlePhaseActionResult | null = null;
  private pendingAutoTurnIntention: AutoTurnIntention | null       = null;
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
    if (this.phase.type === 'battle' && this.phase.isDebug && GameState.getDebugState()) {
      return this.buildDebugBattleSetup();
    }
    const campaign = GameState.getCampaignState();
    return {
      playerUnits:    campaign.roster.units,
      itemContainers: campaign.inventory.containers,
      itemInstances:  campaign.inventory.instances,
    };
  }

  /** Pure adapter — never reconstructs PlayerUnitState records. Deleted in Stage 3. */
  buildDebugBattleSetup(): PlayerBattleSetup {
    const ds = GameState.getDebugState()!;
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

  private buildCampUnits(): CampUnitSnapshot[] {
    const units = GameState.getCampaignState().roster.units;
    return PLAYER_UNITS.map(bp => ({
      templateId: bp.templateId,
      name:       bp.name,
      level:      units[bp.templateId]?.level ?? bp.level,
      inCamp:     units[bp.templateId]?.isInCamp ?? false,
    }));
  }

  private buildProgressionSkillIcons(
    progression: ResolvedUnitProgression,
  ): SkillIconSnapshot[] {
    return progression.skills.map(toSkillIcon);
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

  private buildUpgradeTiers(
    templateId: string,
    debugLevel?: number,
    debugChosenUpgrades?: UnitUpgradeChoices,
  ): UpgradeTierSnapshot[] {
    const bp = PLAYER_UNITS.find(u => u.templateId === templateId);
    if (!bp) return [];
    // buildUpgradeTiers is reachable from the debug flow before any campaign exists
    // (MainMenu → Debug Battle skips new_game) — guard rather than call getCampaignState().
    const unitState = GameState.hasCampaignState()
      ? GameState.getCampaignState().roster.units[templateId]
      : undefined;
    const level = debugLevel ?? unitState?.level ?? bp.level;
    const chosenUpgrades = debugChosenUpgrades ?? unitState?.chosenUpgrades ?? {};
    return (bp.upgradeTiers ?? []).map(tier => ({
      tierId: tier.unlocksAtLevel,
      options: tier.options.map((upg): UpgradeOptionSnapshot => {
        const skill = resolveSkillDefinition(upg.skillId);
        const classChangeName = upg.classId
          ? resolveUnitClassDefinition(upg.classId).name
          : null;
        const previewSheet = resolvePlayerUpgradeSpriteSheet(upg);
        return {
          id:                    upg.id,
          name:                  upg.name,
          skill:                 toSkillIcon(skill),
          statLines:             buildUnitUpgradeStatLines(upg.statModifiers ?? {}),
          unitPreviewTextureKey: previewSheet ? getUnitSpriteTextureKey(bp.templateId, previewSheet) : null,
          classChangeName,
        };
      }),
      chosenUpgradeId: chosenUpgrades[tier.unlocksAtLevel] ?? null,
      isLocked: level < tier.unlocksAtLevel,
    }));
  }

  private buildUnitTabSnapshots(
    debugChosenUpgradesMap?: Record<string, UnitUpgradeChoices>,
  ): UnitTabSnapshot[] {
    return PLAYER_UNITS.map(bp => {
      // Lazily short-circuits: when debugChosenUpgradesMap has an entry, the campaign lookup
      // (which would throw if no campaign exists yet, e.g. debug flow before new_game) is
      // never evaluated.
      const chosenUpgrades =
        debugChosenUpgradesMap?.[bp.templateId] ??
        (GameState.hasCampaignState() ? GameState.getCampaignState().roster.units[bp.templateId]?.chosenUpgrades : undefined) ??
        {};
      const progression = resolveUnitProgression(bp, chosenUpgrades);
      return {
        templateId: bp.templateId,
        name:       bp.name,
        classId:    progression.currentClassId,
        className:  progression.currentClass.name,
        spriteKey:  this.spriteKeyFromProgression(bp, progression),
      };
    });
  }

  // Recomputes data snapshots for phases that carry them.
  // Called after every applyActionSideEffects so GamePhase is always fresh.
  private rebuildSnapshot(phase: GamePhase): GamePhase {
    switch (phase.type) {
      case 'equip_screen': {
        // Only reachable from world_map/camp, both of which require an existing campaign.
        const campaign  = GameState.getCampaignState();
        const bp        = PLAYER_UNITS.find(u => u.templateId === phase.selectedUnitTemplateId);
        const unitState = phase.selectedUnitTemplateId
          ? campaign.roster.units[phase.selectedUnitTemplateId]
          : undefined;
        const progression = bp && unitState
          ? resolveUnitProgression(bp, unitState.chosenUpgrades)
          : null;

        const backpack = buildBackpackSnapshot(
          campaign.inventory.containers,
          campaign.inventory.instances,
          ITEM_CATALOG,
        );
        const unitEquipment = phase.selectedUnitTemplateId
          ? buildEquipmentSnapshot(
              phase.selectedUnitTemplateId,
              campaign.inventory.containers,
              campaign.inventory.instances,
              ITEM_CATALOG,
            )
          : EMPTY_EQUIP_SNAPSHOT;
        const availableUnits        = this.buildUnitTabSnapshots();
        const selectedUnit          = availableUnits.find(u => u.templateId === phase.selectedUnitTemplateId) ?? null;
        const selectedUnitSpriteKey = bp && progression
          ? this.spriteKeyFromProgression(bp, progression)
          : null;
        const unitStats = bp && unitState && progression
          ? buildUnitStatsSnapshot(
              bp,
              unitState.level,
              unitState.permanentBonuses,
              campaign.inventory.containers,
              campaign.inventory.instances,
              ITEM_DEFINITIONS,
              progression.statModifiers,
            )
          : null;
        const learnedSkills = progression ? this.buildProgressionSkillIcons(progression) : [];
        const upgradeSkills = learnedSkills.slice(1, 5);
        return { ...phase, backpack, unitEquipment, availableUnits, selectedUnit, unitStats, learnedSkills, upgradeSkills, selectedUnitSpriteKey };
      }
      case 'camp':
        return { ...phase, units: this.buildCampUnits() };
      case 'debug_equip_screen': {
        // buildDebugBattleSetup() is the pure adapter — playerUnits are real PlayerUnitState
        // records; each unit carries its own level/chosenUpgrades/isInCamp (no session-wide
        // "ds.level" or "ds.campUnitIds" anymore).
        const bp         = PLAYER_UNITS.find(u => u.templateId === phase.selectedUnitTemplateId);
        const debugSetup = this.buildDebugBattleSetup();
        const unitState  = phase.selectedUnitTemplateId
          ? debugSetup.playerUnits[phase.selectedUnitTemplateId]
          : undefined;
        const progression = bp && unitState
          ? resolveUnitProgression(bp, unitState.chosenUpgrades)
          : null;

        const backpack = buildBackpackSnapshot(
          debugSetup.itemContainers,
          debugSetup.itemInstances,
          ITEM_CATALOG,
          'backpack_debug',
        );
        const unitEquipment = phase.selectedUnitTemplateId
          ? buildEquipmentSnapshot(
              phase.selectedUnitTemplateId,
              debugSetup.itemContainers,
              debugSetup.itemInstances,
              ITEM_CATALOG,
            )
          : EMPTY_EQUIP_SNAPSHOT;
        const debugChosenUpgradesMap: Record<string, UnitUpgradeChoices> = {};
        for (const [templateId, us] of Object.entries(debugSetup.playerUnits)) {
          debugChosenUpgradesMap[templateId] = us.chosenUpgrades;
        }
        const availableUnits        = this.buildUnitTabSnapshots(debugChosenUpgradesMap);
        const selectedUnit          = availableUnits.find(u => u.templateId === phase.selectedUnitTemplateId) ?? null;
        const selectedUnitSpriteKey = bp && progression
          ? this.spriteKeyFromProgression(bp, progression)
          : null;
        const unitStats = bp && unitState && progression
          ? buildUnitStatsSnapshot(
              bp,
              unitState.level,
              unitState.permanentBonuses,
              debugSetup.itemContainers,
              debugSetup.itemInstances,
              ITEM_DEFINITIONS,
              progression.statModifiers,
            )
          : null;
        const debugLearnedSkills = progression ? this.buildProgressionSkillIcons(progression) : [];
        const debugUpgradeSkills = debugLearnedSkills.slice(1, 5);
        const campUnitIds = Object.entries(debugSetup.playerUnits)
          .filter(([, us]) => us.isInCamp)
          .map(([templateId]) => templateId);
        return { ...phase, backpack, unitEquipment, availableUnits, selectedUnit, unitStats, campUnitIds, learnedSkills: debugLearnedSkills, upgradeSkills: debugUpgradeSkills, selectedUnitSpriteKey };
      }
      case 'upgrade_tree': {
        const isDebug = phase.returnPhase.type === 'debug_equip_screen';
        // Per-unit lookup — never a session-wide "shared" level or chosenUpgrades.
        const debugUnitState = isDebug
          ? GameState.getDebugState()!.session.roster.units[phase.unitTemplateId]
          : undefined;
        const upgradeTiers = this.buildUpgradeTiers(
          phase.unitTemplateId,
          debugUnitState?.level,
          debugUnitState?.chosenUpgrades,
        );
        return { ...phase, upgradeTiers };
      }
      case 'battle': {
        const battleState = GameState.get();

        const { unitsById, fieldUnits, benchUnits } =
          buildBattleUnitSnapshotViews(battleState);
        const occupancy      = buildBattleOccupancySnapshot(battleState);
        const fieldUnitCells = buildBattleFieldUnitCellsSnapshot(battleState);

        // roundQueue is field-only by invariant — look up via fieldUnits to
        // preserve FieldBattleUnitSnapshot typing for activeUnit.
        const fieldById      = new Map(fieldUnits.map(u => [u.id, u]));
        const activeUnitId   = battleState.roundQueue[0] ?? null;
        const activeUnit     = activeUnitId ? (fieldById.get(activeUnitId) ?? null) : null;

        const battleMode     = GameState.getBattleMode();
        const activeUnitSide = activeUnit?.side ?? null;

        const manualTurnControlsVisible =
          battleMode === 'manual' && activeUnitSide === 'player';

        const manualChargeDisabled =
          activeUnitId !== null &&
          hasChargedThisRound(GameState.getBattleTurnContext(), activeUnitId);

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

        // participants = battle-start snapshot; do NOT rebuild from current placement state
        return {
          ...phase,
          participants:        GameState.battleParticipants,
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
    // ── Clear stale pending auto-turn intention on any action that disrupts battle flow ──
    // These actions can arrive during the 200 ms DELAY_AUTO_IMPACT window between decide and apply.
    if (
      action.type === 'exit_battle'                       ||
      action.type === 'replay'                            ||
      action.type === 'battle_mark_quick_battle_complete' ||
      action.type === 'battle_prepare_quick_battle'       ||
      action.type === 'battle_begin_combat'               ||
      action.type === 'battle_set_mode'
    ) {
      this.pendingAutoTurnIntention = null;
    }

    // ── Battle lifecycle ──
    if (isBattleLifecycleAction(action) && prev.type === 'battle') {
      const currentState = GameState.get();
      const result = applyBattleLifecycleAction({ state: currentState, action });

      if (result.persistCampaignPlacements && !prev.isDebug) {
        const units = { ...GameState.getCampaignState().roster.units };
        let changed = false;
        for (const unit of currentState.units.values()) {
          if (unit.side !== 'player') continue;
          const deployment = currentState.deployments.get(unit.id);
          if (deployment?.kind !== 'field') continue; // bench units have no field placement to save
          const unitState = units[unit.templateId];
          if (!unitState) continue;
          units[unit.templateId] = { ...unitState, lastPlacement: deployment.anchor };
          changed = true;
        }
        if (changed) GameState.replaceCampaignRoster({ units });
      }

      GameState.set(result.state);
      if (result.resetTurnContext) GameState.resetBattleTurnContext();
      return;
    }

    // ── Battle control ──
    if (prev.type === 'battle') {
      if (action.type === 'battle_set_mode') {
        GameState.setBattleMode(action.mode);
        return;
      }
      if (action.type === 'battle_prepare_quick_battle') {
        GameState.resetBattleTurnContext();
        return;
      }
    }

    // ── Battle preview target ──
    if (prev.type === 'battle' &&
        (action.type === 'battle_preview_target' || action.type === 'battle_clear_preview_target')) {
      const target = action.type === 'battle_preview_target' ? action.target : null;
      GameState.set(setBattlePreviewTarget(GameState.get(), target));
      return;
    }

    // ── Battle turn ──
    if (isBattleTurnAction(action) && prev.type === 'battle') {
      const result = applyBattleTurnAction({
        state:                    GameState.get(),
        context:                  GameState.getBattleTurnContext(),
        action,
        mode:                     GameState.getBattleMode(),
        rng:                      this.rngStreams.battleResolution,
        pendingAutoTurnIntention: this.pendingAutoTurnIntention,
      });

      // Manage pending intention lifecycle:
      // decide stores it; apply clears it; everything else leaves it untouched.
      if (action.type === 'battle_decide_auto_turn') {
        this.pendingAutoTurnIntention =
          result.autoTurnDirective?.type === 'intention'
            ? result.autoTurnDirective.intention
            : null;
      } else if (action.type === 'battle_apply_auto_turn') {
        this.pendingAutoTurnIntention = null;
      }

      // Any turn action invalidates a pending preview target (skill/active unit/targets change).
      GameState.set(setBattlePreviewTarget(result.state, null));
      GameState.setBattleTurnContext(result.context);
      this.lastBattleTransition = result;
      return;
    }

    // ── Battle placement ──
    if (isBattlePlacementAction(action) && prev.type === 'battle') {
      const state    = GameState.get();
      const nextState = applyBattlePlacementAction(state, action);
      GameState.set(nextState);
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

    // ── Campaign battle: initialize BattleState + snapshot participants ──
    if (action.type === 'enter_battle') {
      // Build BattleState first so bench info is accurate for participants snapshot
      GameState.reset();
      const setup = this.getActiveBattleSetup();
      const { state, race, enemyPlacements } = buildNewBattleState(
        GameState.get(), setup, action.enemyGroupId, this.rngStreams.battleSetup,
      );
      GameState.set(state);
      GameState.lastEnemyRace       = race;
      GameState.lastEnemyPlacements = enemyPlacements;

      GameState.battleParticipants = this.buildBattleParticipantsFromInitialState(state);
    }

    // ── Debug battle: initialize BattleState + snapshot participants ──
    // Invariant: debug battles never save or replay enemy placements.
    if (action.type === 'start_battle' && GameState.getDebugState()) {
      const setup = this.buildDebugBattleSetup();

      // Build BattleState — no race/placement persistence for debug
      GameState.reset();
      const { state } = buildNewBattleState(GameState.get(), setup, action.enemyGroupId, this.rngStreams.battleSetup);
      GameState.set(state);

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
      GameState.battleParticipants = participants;
    }

    // ── Replay: reinitialize BattleState ──
    if (action.type === 'replay') {
      const phase = prev;
      if (phase.type === 'battle') {
        if (phase.isDebug) {
          // Debug replay = fresh battle. Intentional: debug battles have no saved placements.
          GameState.reset();
          const setup = this.buildDebugBattleSetup();
          const { state } = buildNewBattleState(GameState.get(), setup, phase.enemyGroupId, this.rngStreams.battleSetup);
          GameState.set(state);
        } else {
          const saved = GameState.lastEnemyPlacements;
          if (saved) {
            // Normal case: replay same enemies in same positions
            GameState.reset();
            const setup    = this.getActiveBattleSetup();
            const newState = buildReplayBattleState(GameState.get(), setup, saved);
            GameState.set(newState);
          } else {
            // Fallback: no saved placements, generate fresh
            GameState.reset();
            const setup = this.getActiveBattleSetup();
            const { state } = buildNewBattleState(GameState.get(), setup, phase.enemyGroupId, this.rngStreams.battleSetup);
            GameState.set(state);
          }
        }
      }
    }

    // ── Battle teardown ──
    if (action.type === 'exit_battle' && prev.type === 'battle') {
      const debugState = GameState.getDebugState();
      if (prev.isDebug && debugState) {
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
        const exits = buildPlayerExitInputs(exitParticipants, GameState.get());

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

    // ── Item mutations — applied to EXACTLY ONE inventory state ──
    // debug_equip_screen → DebugBattleState session inventory only; otherwise → CampaignState
    // inventory only. No item action may "no-op through" the wrong state first (closes
    // debug→campaign leak).
    if (action.type === 'equip_item' || action.type === 'unequip_item') {
      const isDebug     = prev.type === 'debug_equip_screen';
      const debugState  = isDebug ? GameState.getDebugState() : null;
      const campaign    = isDebug ? null : GameState.getCampaignState();
      const containers  = isDebug ? debugState!.session.inventory.containers : campaign!.inventory.containers;
      const instances   = isDebug ? debugState!.session.inventory.instances  : campaign!.inventory.instances;
      const backpackId  = isDebug ? 'backpack_debug' : 'backpack_shared';

      const writeContainers = (nextContainers: typeof containers) => {
        if (isDebug) {
          GameState.replaceDebugSession({
            ...debugState!.session,
            inventory: { ...debugState!.session.inventory, containers: nextContainers },
          });
        } else {
          GameState.replaceCampaignInventory({ ...campaign!.inventory, containers: nextContainers });
        }
      };

      if (action.type === 'equip_item') {
        const bp = PLAYER_UNITS.find(u => u.templateId === action.unitTemplateId);
        if (bp) {
          const chosenUpgrades = isDebug
            ? (debugState!.session.roster.units[action.unitTemplateId]?.chosenUpgrades ?? {})
            : (campaign!.roster.units[action.unitTemplateId]?.chosenUpgrades ?? {});
          const progression = resolveUnitProgression(bp, chosenUpgrades);
          const result = equipItem(
            action.unitTemplateId, progression.currentClassId, action.instanceId,
            containers, instances, ITEM_CATALOG,
          );
          if (result.ok) writeContainers(result.nextContainers);
        }
        return;
      }

      // action.type === 'unequip_item'
      const result = unequipItem(
        action.unitTemplateId, action.slot as EquipSlot,
        containers, instances, ITEM_CATALOG, backpackId,
      );
      if (result.ok) writeContainers(result.nextContainers);
      return;
    }

    // ── Camp unit toggle ──
    if (action.type === 'toggle_camp_unit') {
      const c = GameState.getCampaignState();
      const unitState = c.roster.units[action.templateId];
      if (unitState) {
        GameState.replaceCampaignRoster({
          units: { ...c.roster.units, [action.templateId]: { ...unitState, isInCamp: !unitState.isInCamp } },
        });
      }
    }

    // ── Upgrade choice ──
    if (action.type === 'choose_upgrade') {
      const isDebugContext = prev.type === 'upgrade_tree' && prev.returnPhase.type === 'debug_equip_screen';
      if (isDebugContext) {
        const debugState = GameState.getDebugState()!;
        const units = debugState.session.roster.units;
        const us = units[action.templateId];
        const existing = us?.chosenUpgrades ?? {};
        if (us && !existing[action.tierId]) {
          const nextUnit = { ...us, chosenUpgrades: { ...existing, [action.tierId]: action.upgradeId } };
          GameState.replaceDebugSession({
            ...debugState.session,
            roster: { units: { ...units, [action.templateId]: nextUnit } },
          });
        }
      } else {
        const c = GameState.getCampaignState();
        const unitState = c.roster.units[action.templateId];
        if (unitState && !unitState.chosenUpgrades[action.tierId]) {
          GameState.replaceCampaignRoster({
            units: {
              ...c.roster.units,
              [action.templateId]: {
                ...unitState,
                chosenUpgrades: { ...unitState.chosenUpgrades, [action.tierId]: action.upgradeId },
              },
            },
          });
        }
      }
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

    if (action.type === 'toggle_debug_camp') {
      const debugState = GameState.getDebugState()!;
      const units = debugState.session.roster.units;
      const us = units[action.templateId];
      if (us) {
        GameState.replaceDebugSession({
          ...debugState.session,
          roster: { units: { ...units, [action.templateId]: { ...us, isInCamp: !us.isInCamp } } },
        });
      }
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

    const runtimePlayerByTemplateId = new Map<string, Unit>();
    for (const u of GameState.get().units.values()) {
      if (u.side !== 'player') continue;
      if (runtimePlayerByTemplateId.has(u.templateId)) {
        throw new Error(
          `[Stage5] Duplicate runtime player unit for templateId="${u.templateId}". ` +
          `Campaign roster invariant violated.`,
        );
      }
      runtimePlayerByTemplateId.set(u.templateId, u);
    }

    return phase.participants.map(pp => {
      const runtime = runtimePlayerByTemplateId.get(pp.templateId);
      if (runtime) {
        // Runtime state wins over wasOnBench. A bench-origin unit that was
        // moved to field during placement and then died is reported dead.
        return { ...pp, isAlive: isAlive(runtime) };
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
        selectedUnitTemplateId: '',
        selectedUnitSpriteKey: null,          // filled by rebuildSnapshot
        selectedUnit: null,                   // filled by rebuildSnapshot
        availableUnits: [],
        backpack: EMPTY_BACKPACK_SNAPSHOT,
        unitEquipment: EMPTY_EQUIP_SNAPSHOT,
        unitStats: null,
        campUnitIds: [],
        learnedSkills: [],
        upgradeSkills: [],
      };

    case 'switch_debug_unit':
      if (current.type !== 'debug_equip_screen') return null;
      return { ...current, selectedUnitTemplateId: action.templateId };

    case 'toggle_debug_camp':
      if (current.type !== 'debug_equip_screen') return null;
      return current; // mutation-only → STATE_CHANGED

    case 'move_party':
      if (current.type !== 'world_map') return null;
      return current; // mutation-only — position lives in CampaignState.world, not the phase

    case 'enter_battle':
      if (current.type !== 'world_map') return null;
      return {
        type:               'battle',
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
      return { type: 'camp', returnPhase: current, units: [] };

    case 'exit_camp':
      if (current.type !== 'camp') return null;
      return current.returnPhase;

    case 'start_battle':
      if (current.type !== 'debug_equip_screen') return null;
      return {
        type:               'battle',
        enemyGroupId:       action.enemyGroupId,
        returnPhase:        current,
        isDebug:            true,
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
      const templateId = current.selectedUnitTemplateId;
      const bp = PLAYER_UNITS.find(u => u.templateId === templateId);
      return {
        type: 'upgrade_tree',
        unitTemplateId: templateId,
        unitName: bp?.name ?? '',
        returnPhase: current,
        upgradeTiers: [], // filled by rebuildSnapshot
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
    case 'toggle_camp_unit': {
      if (current.type !== 'camp') return null;
      const unit = current.units.find(u => u.templateId === action.templateId);
      if (!unit) return null;
      const activeCount = current.units.filter(u => !u.inCamp).length;
      if (!unit.inCamp && activeCount <= 1) return null; // can't bench last active unit
      return current; // same reference → mutation-only path → STATE_CHANGED
    }

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
  if (battlePhase.isDebug || !battlePhase.mapId || !battlePhase.triggerPos) return false;
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
