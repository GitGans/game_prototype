import Phaser from 'phaser';
import { GamePhase, PhaseAction, CampUnitSnapshot, SkillIconSnapshot, UpgradeTierSnapshot, UpgradeOptionSnapshot, EMPTY_BACKPACK_SNAPSHOT, EMPTY_EQUIP_SNAPSHOT, BattleParticipant } from './phases';
import { DebugBattleState, createDebugBattleState } from './DebugBattleState';
import { GameState } from './GameState';
import { EventBus, Events } from './EventBus';
import { MAP_DEFINITIONS } from '../data/mapDefinitions';
import { PLAYER_UNITS } from '../data/unitDefinitions';
import { ITEM_DEFINITIONS } from '../data/itemDefinitions';
import { initSubMapState } from '../world/mapLogic';
import { SubMapDefinition, SubMapState } from '../world/types';
import {
  equipItem,
  unequipItem,
  useItem,
  buildBackpackSnapshot,
  buildEquipmentSnapshot,
  getSellPrice,
} from '../battle/itemOps';
import {
  UnitTabSnapshot,
  Skill,
} from '../battle/types';
import { buildSkillIconSnapshot, buildUnitUpgradeDescription, buildUnitUpgradeStatLines } from './unitUpgradePresentation';
import { PlayerUnitState } from './GameState';
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
  type BattlePhaseActionResult,
  type AutoTurnIntention,
} from './phaseHandlers/battlePhaseHandler';
import { buildBenchUnitSnapshots } from './unitPreviewSnapshot';
import { buildBattleUnitSnapshots, buildBattleOccupancySnapshot } from './battleSnapshotBuilder';
import { getActiveSkill } from '../battle/skillRuntime';
import { compileLegacySkill, isFriendlyOrSelfTargetPolicy } from '../battle/skillUsePlan';
import { hasChargedThisRound } from '../battle/turnResolver';
import { resolveUnitProgression, type ResolvedUnitProgression, type UnitUpgradeChoices } from './unitProgression';
import { buildUnitStatsSnapshot } from './unitStatsSnapshot';
import { getUnitSpriteTextureKey } from './unitSpriteKey';
import { createDefaultGameplayRngStreams, type GameplayRngStreams } from './random';

function toSkillIcon(skill: Skill): SkillIconSnapshot {
  return buildSkillIconSnapshot(skill);
}

class PhaseManagerClass {
  private phase: GamePhase = { type: 'main_menu' };
  private game!: Phaser.Game;
  private debugState: DebugBattleState | null = null;
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
    return this.debugState;
  }

  getActiveBattleSetup(): PlayerBattleSetup {
    if (this.phase.type === 'battle' && this.phase.isDebug && this.debugState) {
      return this.buildDebugBattleSetup();
    }
    return {
      playerUnits:    GameState.playerUnits,
      itemContainers: GameState.itemContainers,
      itemInstances:  GameState.itemInstances,
    };
  }

  buildDebugBattleSetup(): PlayerBattleSetup {
    const ds = this.debugState!;
    const playerUnits: Record<string, PlayerUnitState> = {};
    for (const bp of PLAYER_UNITS) {
      playerUnits[bp.templateId] = {
        level:            ds.level,
        isInCamp:         ds.campUnitIds.includes(bp.templateId),
        lastPlacement:    ds.playerUnitPlacements?.[bp.templateId] ?? null,
        permanentBonuses: ds.unitPermanentBonuses[bp.templateId] ?? {},
        chosenUpgrades:   ds.chosenUpgrades[bp.templateId] ?? {},
      };
    }
    return {
      playerUnits,
      itemContainers: ds.itemContainers,
      itemInstances:  ds.itemInstances,
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
    let exitParticipants: BattleParticipant[] = [];
    if (action.type === 'exit_battle' && action.outcome === 'victory' && this.phase.type === 'battle') {
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
    return PLAYER_UNITS.map(bp => ({
      templateId: bp.templateId,
      name:       bp.name,
      level:      GameState.playerUnits[bp.templateId]?.level ?? bp.level,
      inCamp:     GameState.playerUnits[bp.templateId]?.isInCamp ?? false,
    }));
  }

  private buildProgressionSkillIcons(
    progression: ResolvedUnitProgression,
  ): SkillIconSnapshot[] {
    return progression.skills.map(toSkillIcon);
  }

  private spriteKeyFromProgression(
    templateId: string,
    progression: ResolvedUnitProgression,
  ): string | null {
    return progression.spriteSheet
      ? getUnitSpriteTextureKey(templateId, progression.spriteSheet)
      : null;
  }

  private buildUpgradeTiers(
    templateId: string,
    debugLevel?: number,
    debugChosenUpgrades?: Partial<Record<5 | 10 | 15 | 20, string>>,
  ): UpgradeTierSnapshot[] {
    const bp = PLAYER_UNITS.find(u => u.templateId === templateId);
    if (!bp) return [];
    const unitState = GameState.playerUnits[templateId];
    const level = debugLevel ?? unitState?.level ?? bp.level;
    const chosenUpgrades = debugChosenUpgrades ?? unitState?.chosenUpgrades ?? {};
    return (bp.upgradeTiers ?? []).map(tier => ({
      tierId: tier.unlocksAtLevel,
      options: tier.options.map((upg): UpgradeOptionSnapshot => ({
        id:           upg.id,
        name:         upg.name,
        description:  buildUnitUpgradeDescription(upg),
        skill:        upg.skill ? toSkillIcon(upg.skill) : null,
        statLines:    buildUnitUpgradeStatLines(upg.statModifiers ?? {}),
        spritePreview: upg.spriteSheet
          ? getUnitSpriteTextureKey(bp.templateId, upg.spriteSheet)
          : null,
      })),
      chosenUpgradeId: chosenUpgrades[tier.unlocksAtLevel] ?? null,
      isLocked: level < tier.unlocksAtLevel,
    }));
  }

  private buildUnitTabSnapshots(
    debugChosenUpgradesMap?: Record<string, UnitUpgradeChoices>,
  ): UnitTabSnapshot[] {
    return PLAYER_UNITS.map(bp => {
      const chosenUpgrades =
        debugChosenUpgradesMap?.[bp.templateId] ??
        GameState.playerUnits[bp.templateId]?.chosenUpgrades ??
        {};
      const progression = resolveUnitProgression(bp, chosenUpgrades);
      return {
        templateId: bp.templateId,
        name:       bp.name,
        unitClass:  bp.unitClass,
        spriteKey:  this.spriteKeyFromProgression(bp.templateId, progression),
      };
    });
  }

  // Recomputes data snapshots for phases that carry them.
  // Called after every applyActionSideEffects so GamePhase is always fresh.
  private rebuildSnapshot(phase: GamePhase): GamePhase {
    switch (phase.type) {
      case 'equip_screen': {
        const bp        = PLAYER_UNITS.find(u => u.templateId === phase.selectedUnitTemplateId);
        const unitState = phase.selectedUnitTemplateId
          ? GameState.playerUnits[phase.selectedUnitTemplateId]
          : undefined;
        const progression = bp && unitState
          ? resolveUnitProgression(bp, unitState.chosenUpgrades)
          : null;

        const backpack = buildBackpackSnapshot(
          GameState.itemContainers,
          GameState.itemInstances,
          ITEM_DEFINITIONS,
        );
        const unitEquipment = phase.selectedUnitTemplateId
          ? buildEquipmentSnapshot(
              phase.selectedUnitTemplateId,
              GameState.itemContainers,
              GameState.itemInstances,
              ITEM_DEFINITIONS,
            )
          : EMPTY_EQUIP_SNAPSHOT;
        const availableUnits        = this.buildUnitTabSnapshots();
        const selectedUnit          = availableUnits.find(u => u.templateId === phase.selectedUnitTemplateId) ?? null;
        const selectedUnitSpriteKey = phase.selectedUnitTemplateId && progression
          ? this.spriteKeyFromProgression(phase.selectedUnitTemplateId, progression)
          : null;
        const unitStats = bp && unitState && progression
          ? buildUnitStatsSnapshot(
              bp,
              unitState.level,
              unitState.permanentBonuses,
              GameState.itemContainers,
              GameState.itemInstances,
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
        const ds         = this.debugState!;
        const bp         = PLAYER_UNITS.find(u => u.templateId === phase.selectedUnitTemplateId);
        const debugSetup = this.buildDebugBattleSetup();
        const unitState  = phase.selectedUnitTemplateId
          ? debugSetup.playerUnits[phase.selectedUnitTemplateId]
          : undefined;
        const progression = bp && unitState
          ? resolveUnitProgression(bp, ds.chosenUpgrades[phase.selectedUnitTemplateId] ?? {})
          : null;

        const backpack = buildBackpackSnapshot(
          ds.itemContainers,
          ds.itemInstances,
          ITEM_DEFINITIONS,
          'backpack_debug',
        );
        const unitEquipment = phase.selectedUnitTemplateId
          ? buildEquipmentSnapshot(
              phase.selectedUnitTemplateId,
              ds.itemContainers,
              ds.itemInstances,
              ITEM_DEFINITIONS,
            )
          : EMPTY_EQUIP_SNAPSHOT;
        const availableUnits        = this.buildUnitTabSnapshots(ds.chosenUpgrades);
        const selectedUnit          = availableUnits.find(u => u.templateId === phase.selectedUnitTemplateId) ?? null;
        const selectedUnitSpriteKey = phase.selectedUnitTemplateId && progression
          ? this.spriteKeyFromProgression(phase.selectedUnitTemplateId, progression)
          : null;
        const unitStats = bp && unitState && progression
          ? buildUnitStatsSnapshot(
              bp,
              ds.level,
              unitState.permanentBonuses,
              ds.itemContainers,
              ds.itemInstances,
              ITEM_DEFINITIONS,
              progression.statModifiers,
            )
          : null;
        const debugLearnedSkills = progression ? this.buildProgressionSkillIcons(progression) : [];
        const debugUpgradeSkills = debugLearnedSkills.slice(1, 5);
        return { ...phase, backpack, unitEquipment, availableUnits, selectedUnit, unitStats, campUnitIds: [...ds.campUnitIds], learnedSkills: debugLearnedSkills, upgradeSkills: debugUpgradeSkills, selectedUnitSpriteKey };
      }
      case 'upgrade_tree': {
        const isDebug = phase.returnPhase.type === 'debug_equip_screen';
        const ds = isDebug ? this.debugState! : undefined;
        const upgradeTiers = this.buildUpgradeTiers(
          phase.unitTemplateId,
          ds?.level,
          ds?.chosenUpgrades[phase.unitTemplateId],
        );
        return { ...phase, upgradeTiers };
      }
      case 'battle': {
        const battleState = GameState.get();
        const setup       = this.getActiveBattleSetup();

        // ── Existing bench/participants rebuild ───────────────────────────
        const benchUnits = buildBenchUnitSnapshots(battleState.benchUnits, setup);

        // ── Stage 4: full scene-facing render data ────────────────────────
        const units     = buildBattleUnitSnapshots(battleState.units);
        const unitsById = new Map(units.map(u => [u.id, u]));
        const occupancy = buildBattleOccupancySnapshot(battleState);

        const activeUnitId = battleState.roundQueue[0] ?? null;
        const activeUnit   = activeUnitId ? (unitsById.get(activeUnitId) ?? null) : null;

        const battleMode     = GameState.getBattleMode();
        const activeUnitSide = activeUnit?.anchor.side ?? null;

        const manualTurnControlsVisible =
          battleMode === 'manual' && activeUnitSide === 'player';

        const manualChargeDisabled =
          activeUnitId !== null &&
          hasChargedThisRound(GameState.getBattleTurnContext(), activeUnitId);

        let targetHighlightKind: 'target' | 'heal_target' | 'none' = 'none';
        if (activeUnit && battleState.validTargets.length > 0) {
          const activeSkill = getActiveSkill(activeUnit);
          const activePlan  = compileLegacySkill(activeSkill);
          targetHighlightKind = isFriendlyOrSelfTargetPolicy(activePlan.targetPolicy)
            ? 'heal_target'
            : 'target';
        }

        // participants = battle-start snapshot; do NOT rebuild from current placement state
        return {
          ...phase,
          participants:        GameState.battleParticipants,
          benchUnits,
          placementSelection:  battleState.placementSelection,
          battlePhase:         battleState.phase,
          units,
          unitsById,
          occupancy,
          roundQueue:          [...battleState.roundQueue],
          activeUnitId,
          activeUnit,
          battleMode,
          activeUnitSide,
          manualTurnControlsVisible,
          manualChargeDisabled,
          validTargets:        battleState.validTargets.map(c => ({ ...c })),
          targetHighlightKind,
        };
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
        for (const unit of currentState.units.values()) {
          if (unit.anchor.side !== 'player') continue;
          const unitState = GameState.playerUnits[unit.templateId];
          if (!unitState) continue;
          GameState.playerUnits[unit.templateId] = { ...unitState, lastPlacement: unit.anchor };
        }
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

      GameState.set(result.state);
      GameState.setBattleTurnContext(result.context);
      this.lastBattleTransition = result;
      return;
    }

    // ── Battle placement ──
    if (isBattlePlacementAction(action) && prev.type === 'battle') {
      const state    = GameState.get();
      const setup    = this.getActiveBattleSetup();
      const nextState = applyBattlePlacementAction(state, setup, action);
      GameState.set(nextState);
      return;
    }

    // ── Campaign init ──
    if (action.type === 'new_game') {
      this.rngStreams = createDefaultGameplayRngStreams();
      const mapId = 'test_01';
      if (!GameState.subMapStates[mapId]) {
        GameState.subMapStates[mapId] = initSubMapState(MAP_DEFINITIONS[mapId]);
      }
      // Initialize playerUnits (idempotent)
      if (Object.keys(GameState.playerUnits).length === 0) {
        for (const bp of PLAYER_UNITS) {
          GameState.playerUnits[bp.templateId] = {
            level: bp.level,
            isInCamp: PLAYER_UNITS.indexOf(bp) >= 9, // last 3 start in camp
            lastPlacement: null,
            permanentBonuses: {},
            chosenUpgrades: {},
          };
        }
      }
      // Item containers init (idempotent)
      if (!GameState.itemContainers['backpack_shared']) {
        GameState.itemContainers['backpack_shared'] = {
          id: 'backpack_shared', kind: 'backpack', slots: {},
        };
        for (const bp of PLAYER_UNITS) {
          GameState.itemContainers[`equip_${bp.templateId}`] = {
            id: `equip_${bp.templateId}`, kind: 'equipment',
            ownerTemplateId: bp.templateId, slots: {},
          };
        }
        let counter = 1;
        const add = (slot: string, defId: string) => {
          const id = `item_${String(counter++).padStart(3, '0')}`;
          GameState.itemInstances[id] = { id, definitionId: defId };
          GameState.itemContainers['backpack_shared'].slots[slot] = id;
        };
        add('0', 'bronze_ring');
        add('1', 'iron_ring');
        add('2', 'bronze_necklace');
      }
      if (!GameState.money) GameState.money = 0;
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

      // Snapshot all party members (field + bench) before anyone can die
      const participants: BattleParticipant[] = [];
      Object.entries(GameState.playerUnits).forEach(([templateId, us]) => {
        if (us.isInCamp) return;
        const bp = PLAYER_UNITS.find(b => b.templateId === templateId);
        if (!bp) return;
        const wasOnBench  = state.benchUnits.some(b => b?.templateId === templateId);
        const progression = resolveUnitProgression(bp, us.chosenUpgrades ?? {});
        const spriteKey   = this.spriteKeyFromProgression(templateId, progression);
        participants.push({ templateId, name: bp.name, level: us.level, isAlive: true, wasOnBench, spriteKey });
      });
      GameState.battleParticipants = participants;
    }

    // ── Debug battle: initialize BattleState + snapshot participants ──
    // Invariant: debug battles never save or replay enemy placements.
    if (action.type === 'start_battle' && this.debugState) {
      const ds    = this.debugState;
      const setup = this.buildDebugBattleSetup();

      // Build BattleState — no race/placement persistence for debug
      GameState.reset();
      const { state } = buildNewBattleState(GameState.get(), setup, action.enemyGroupId, this.rngStreams.battleSetup);
      GameState.set(state);

      // Snapshot debug participants (all non-camp units; bench not tracked for debug)
      const participants: BattleParticipant[] = [];
      for (const bp of PLAYER_UNITS) {
        if (ds.campUnitIds.includes(bp.templateId)) continue;
        const progression = resolveUnitProgression(bp, ds.chosenUpgrades[bp.templateId] ?? {});
        const spriteKey   = this.spriteKeyFromProgression(bp.templateId, progression);
        participants.push({ templateId: bp.templateId, name: bp.name, level: ds.level, isAlive: true, wasOnBench: false, spriteKey });
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
      if (prev.isDebug && this.debugState) {
        // Debug teardown: XP goes to DebugBattleState only — never touches GameState
        if (action.outcome === 'victory') {
          this.debugState.level += 1;
        }
      } else {
        const state = GameState.get();

        // Level up all participants (field alive + field dead + bench) — not just state.units
        if (action.outcome === 'victory') {
          exitParticipants.forEach((p) => {
            const us = GameState.playerUnits[p.templateId];
            if (!us) return;
            const newLevel = us.level + 1;
            GameState.playerUnits[p.templateId] = { ...us, level: newLevel };

            if (!p.wasOnBench) {
              // Update live stats only if unit survived (dead units were removed from state.units)
              const liveUnit = [...state.units.values()].find(u => u.templateId === p.templateId);
              if (liveUnit) {
                const bp = PLAYER_UNITS.find(b => b.templateId === p.templateId);
                if (!bp) return;
                const scale = 1 + 0.1 * (newLevel - 1);
                liveUnit.level          = newLevel;
                liveUnit.maxHp          = Math.round(bp.hp * scale);
                liveUnit.physicalDamage = Math.round(bp.physicalDamage * scale);
                liveUnit.magicalDamage  = Math.round(bp.magicalDamage  * scale);
              }
            }
          });
          GameState.set(state);
        }

        // Save last field placement
        for (const unit of GameState.get().units.values()) {
          if (unit.anchor.side !== 'player') continue;
          const us = GameState.playerUnits[unit.templateId];
          if (us) GameState.playerUnits[unit.templateId] = { ...us, lastPlacement: unit.anchor };
        }

        // Mark trigger entity dead on the map — victory only; defeat must leave the encounter intact
        // INVARIANT: action.outcome === 'victory' is required before mutating entityStates.
        // Test cases when a harness exists:
        //   victory + mapId + triggerPos → entityStates[key].alive === false
        //   defeat  + mapId + triggerPos → entityStates[key] unchanged (still alive)
        if (action.outcome === 'victory' && prev.mapId && prev.triggerPos) {
          const key = `${prev.triggerPos.x},${prev.triggerPos.y}`;
          const mapState = GameState.subMapStates[prev.mapId];
          if (mapState) mapState.entityStates[key] = { alive: false };
        }
      }
    }

    // ── Item mutations ──
    if (action.type === 'equip_item') {
      const bp = PLAYER_UNITS.find(u => u.templateId === action.unitTemplateId);
      if (bp) {
        equipItem(
          action.unitTemplateId,
          bp.unitClass,
          action.instanceId,
          GameState.itemContainers,
          GameState.itemInstances,
          ITEM_DEFINITIONS,
        );
      }
    }

    if (action.type === 'unequip_item') {
      unequipItem(
        action.unitTemplateId,
        action.slot as any,
        GameState.itemContainers,
        GameState.itemInstances,
        ITEM_DEFINITIONS,
      );
    }

    if (action.type === 'use_item') {
      // Build temporary bonuses record for useItem compat, then sync back
      const bonusRecord: Record<string, Partial<import('../battle/types').BattleStatBonuses>> = {};
      for (const [id, unitState] of Object.entries(GameState.playerUnits)) {
        bonusRecord[id] = unitState.permanentBonuses;
      }
      useItem(
        action.instanceId,
        action.unitTemplateId,
        GameState.itemContainers,
        GameState.itemInstances,
        bonusRecord,
        ITEM_DEFINITIONS,
      );
      const unitStateAfter = GameState.playerUnits[action.unitTemplateId];
      if (unitStateAfter) {
        GameState.playerUnits[action.unitTemplateId] = {
          ...unitStateAfter,
          permanentBonuses: bonusRecord[action.unitTemplateId] ?? {},
        };
      }
    }

    // ── Camp unit toggle ──
    if (action.type === 'toggle_camp_unit') {
      const unitState = GameState.playerUnits[action.templateId];
      if (unitState) {
        GameState.playerUnits[action.templateId] = { ...unitState, isInCamp: !unitState.isInCamp };
      }
    }

    // ── Upgrade choice ──
    if (action.type === 'choose_upgrade') {
      const isDebugContext = prev.type === 'upgrade_tree' && prev.returnPhase.type === 'debug_equip_screen';
      if (isDebugContext) {
        const ds = this.debugState!;
        const existing = ds.chosenUpgrades[action.templateId] ?? {};
        if (!existing[action.tierId]) {
          ds.chosenUpgrades[action.templateId] = { ...existing, [action.tierId]: action.upgradeId };
        }
      } else {
        const unitState = GameState.playerUnits[action.templateId];
        if (unitState && !unitState.chosenUpgrades[action.tierId]) {
          GameState.playerUnits[action.templateId] = {
            ...unitState,
            chosenUpgrades: { ...unitState.chosenUpgrades, [action.tierId]: action.upgradeId },
          };
        }
      }
    }

    // ── Debug mode ──
    if (action.type === 'init_debug') {
      this.debugState = createDebugBattleState(action.level);
      this.rngStreams = createDefaultGameplayRngStreams();
    }

    if (action.type === 'toggle_debug_camp') {
      const ds = this.debugState!;
      const idx = ds.campUnitIds.indexOf(action.templateId);
      if (idx >= 0) ds.campUnitIds.splice(idx, 1);
      else          ds.campUnitIds.push(action.templateId);
    }

    if (action.type === 'equip_item' && prev.type === 'debug_equip_screen') {
      const bp = PLAYER_UNITS.find(u => u.templateId === action.unitTemplateId);
      if (bp) {
        equipItem(
          action.unitTemplateId,
          bp.unitClass,
          action.instanceId,
          this.debugState!.itemContainers,
          this.debugState!.itemInstances,
          ITEM_DEFINITIONS,
        );
      }
      return; // skip GameState mutation below
    }

    if (action.type === 'unequip_item' && prev.type === 'debug_equip_screen') {
      unequipItem(
        action.unitTemplateId,
        action.slot as any,
        this.debugState!.itemContainers,
        this.debugState!.itemInstances,
        ITEM_DEFINITIONS,
        'backpack_debug',
      );
      return;
    }

    if (action.type === 'use_item' && prev.type === 'debug_equip_screen') {
      useItem(
        action.instanceId,
        action.unitTemplateId,
        this.debugState!.itemContainers,
        this.debugState!.itemInstances,
        this.debugState!.unitPermanentBonuses,
        ITEM_DEFINITIONS,
      );
      return;
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

  // Mutates the world_map phase position without triggering a scene switch.
  updateWorldMapPos(mapId: string, pos: { x: number; y: number }): void {
    if (this.phase.type === 'world_map') {
      this.phase = { type: 'world_map', mapId, partyPos: pos };
    }
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

  private buildExitParticipants(): BattleParticipant[] {
    const phase = this.phase;
    if (phase.type !== 'battle') return [];

    const aliveTemplateIds = new Set(
      [...GameState.get().units.values()]
        .filter(u => u.anchor.side === 'player')
        .map(u => u.templateId),
    );

    return phase.participants.map(pp => ({
      ...pp,
      isAlive: pp.wasOnBench || aliveTemplateIds.has(pp.templateId),
    }));
  }
}

// ─── Pure transition logic — no Phaser imports, no GameState access ───────────

export function resolveTransition(current: GamePhase, action: PhaseAction, mapCleared = false, derivedExitParticipants: BattleParticipant[] = []): GamePhase | null {
  switch (action.type) {

    case 'new_game':
      return { type: 'world_map', mapId: 'test_01', partyPos: MAP_DEFINITIONS['test_01'].startPos };

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
        placementSelection: { selectedBenchIdx: null, selectedFieldUnitId: null },   // filled by rebuildSnapshot
        battlePhase:         'placement',
        units:               [],
        unitsById:           new Map(),
        occupancy:           { cellToUnitId: new Map(), unitToCells: new Map() },
        roundQueue:          [],
        activeUnitId:        null,
        activeUnit:          null,
        battleMode:               'manual',                                           // filled by rebuildSnapshot
        activeUnitSide:           null,                                               // filled by rebuildSnapshot
        manualTurnControlsVisible: false,                                             // filled by rebuildSnapshot
        manualChargeDisabled:     false,                                              // filled by rebuildSnapshot
        validTargets:        [],
        targetHighlightKind: 'none',
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
        placementSelection: { selectedBenchIdx: null, selectedFieldUnitId: null },   // filled by rebuildSnapshot
        battlePhase:         'placement',
        units:               [],
        unitsById:           new Map(),
        occupancy:           { cellToUnitId: new Map(), unitToCells: new Map() },
        roundQueue:          [],
        activeUnitId:        null,
        activeUnit:          null,
        battleMode:               'manual',                                           // filled by rebuildSnapshot
        activeUnitSide:           null,                                               // filled by rebuildSnapshot
        manualTurnControlsVisible: false,                                             // filled by rebuildSnapshot
        manualChargeDisabled:     false,                                              // filled by rebuildSnapshot
        validTargets:        [],
        targetHighlightKind: 'none',
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

    case 'use_item':
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
  }
}

// ─── Helpers (kept for future shop phase) ─────────────────────────────────────

function _findFreeBackpackSlotKey(container: any): string | null {
  for (let i = 0; i < 10; i++) {
    if (container.slots[String(i)] === undefined) return String(i);
  }
  return null;
}
void _findFreeBackpackSlotKey;

function _generateItemId(instances: Record<string, any>): string {
  let n = Object.keys(instances).length + 1;
  while (instances[`item_${String(n).padStart(3, '0')}`]) n++;
  return `item_${String(n).padStart(3, '0')}`;
}
void _generateItemId;

// keep getSellPrice import alive for future shop use
const _getSellPrice = getSellPrice;
void _getSellPrice;

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
  const mapState = GameState.subMapStates[battlePhase.mapId];
  if (!mapDef || !mapState) return false;

  const key = `${battlePhase.triggerPos.x},${battlePhase.triggerPos.y}`;
  const virtualEntityStates = { ...mapState.entityStates, [key]: { alive: false } };
  const virtualMapState: SubMapState = { ...mapState, entityStates: virtualEntityStates };

  return allMobsDead(mapDef, virtualMapState);
}

export const PhaseManager = new PhaseManagerClass();
