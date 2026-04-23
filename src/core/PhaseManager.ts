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
import { PlayerUnitState } from './GameState';
import { PlayerBattleSetup } from '../battle/autoPlace';
import { resolveUnitSkills, type UnitUpgradeChoices } from './unitProgression';
import { buildUnitStatsSnapshot } from './unitStatsSnapshot';

function toSkillIcon(skill: Skill): import('./phases').SkillIconSnapshot {
  return {
    id:          skill.id,
    name:        skill.name,
    description: buildSkillDescription(skill),
    damageType:  skill.damageBlock?.damageType ?? null,
    actionType:  skill.actionType,
  };
}

function buildSkillDescription(skill: Skill): string {
  if (skill.effectBlock) return `${skill.actionType} · applies ${skill.effectBlock.effectDisplayName}`;
  if (skill.instantEffectBlock) return `${skill.actionType} · ${skill.instantEffectBlock.displayName}`;
  if (skill.damageBlock) return `${skill.actionType} · ${skill.damageBlock.damageType} damage`;
  return skill.actionType;
}

class PhaseManagerClass {
  private phase: GamePhase = { type: 'main_menu' };
  private game!: Phaser.Game;
  private debugState: DebugBattleState | null = null;

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

  transition(action: PhaseAction): void {
    const next = resolveTransition(this.phase, action);
    if (next === null) return; // invalid action for current phase

    this.applyActionSideEffects(action, this.phase);

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

  private buildLearnedSkills(
    templateId: string,
    debugChosenUpgrades?: UnitUpgradeChoices,
  ): SkillIconSnapshot[] {
    const bp = PLAYER_UNITS.find(u => u.templateId === templateId);
    if (!bp) return [];
    const chosenUpgrades = debugChosenUpgrades ?? GameState.playerUnits[templateId]?.chosenUpgrades ?? {};
    return resolveUnitSkills(bp, chosenUpgrades).map(toSkillIcon);
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
        id:            upg.id,
        name:          upg.name,
        description:   upg.description ?? '',
        skill:         upg.skill ? toSkillIcon(upg.skill) : null,
        statModifiers: upg.statModifiers ?? {},
        spritePreview: upg.spriteSheet?.path ?? null,
      })),
      chosenUpgradeId: chosenUpgrades[tier.unlocksAtLevel] ?? null,
      isLocked: level < tier.unlocksAtLevel,
    }));
  }

  // Recomputes data snapshots for phases that carry them.
  // Called after every applyActionSideEffects so GamePhase is always fresh.
  private rebuildSnapshot(phase: GamePhase): GamePhase {
    switch (phase.type) {
      case 'equip_screen': {
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
        const availableUnits: UnitTabSnapshot[] = PLAYER_UNITS.map(bp => ({
          templateId: bp.templateId,
          name: bp.name,
          unitClass: bp.unitClass,
        }));
        const unitStats = phase.selectedUnitTemplateId
          ? (() => {
              const bp        = PLAYER_UNITS.find(u => u.templateId === phase.selectedUnitTemplateId);
              const unitState = GameState.playerUnits[phase.selectedUnitTemplateId];
              return bp && unitState
                ? buildUnitStatsSnapshot(
                    bp,
                    unitState.level,
                    unitState,
                    GameState.itemContainers,
                    GameState.itemInstances,
                    ITEM_DEFINITIONS,
                  )
                : null;
            })()
          : null;
        const learnedSkills = this.buildLearnedSkills(phase.selectedUnitTemplateId);
        const upgradeSkills = learnedSkills.slice(1, 5);
        return { ...phase, backpack, unitEquipment, availableUnits, unitStats, learnedSkills, upgradeSkills };
      }
      case 'camp':
        return { ...phase, units: this.buildCampUnits() };
      case 'debug_equip_screen': {
        const ds = this.debugState!;
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
        const availableUnits: UnitTabSnapshot[] = PLAYER_UNITS.map(bp => ({
          templateId: bp.templateId,
          name: bp.name,
          unitClass: bp.unitClass,
        }));
        const debugSetup = this.buildDebugBattleSetup();
        const unitStats = phase.selectedUnitTemplateId
          ? (() => {
              const bp        = PLAYER_UNITS.find(u => u.templateId === phase.selectedUnitTemplateId);
              const unitState = debugSetup.playerUnits[phase.selectedUnitTemplateId];
              return bp && unitState
                ? buildUnitStatsSnapshot(
                    bp,
                    ds.level,
                    unitState,
                    ds.itemContainers,
                    ds.itemInstances,
                    ITEM_DEFINITIONS,
                  )
                : null;
            })()
          : null;
        const debugLearnedSkills = this.buildLearnedSkills(
          phase.selectedUnitTemplateId,
          ds.chosenUpgrades[phase.selectedUnitTemplateId],
        );
        const debugUpgradeSkills = debugLearnedSkills.slice(1, 5);
        return { ...phase, backpack, unitEquipment, availableUnits, unitStats, campUnitIds: [...ds.campUnitIds], learnedSkills: debugLearnedSkills, upgradeSkills: debugUpgradeSkills };
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
      case 'battle':
        return { ...phase, participants: GameState.battleParticipants };
      default:
        return phase; // phases without snapshots pass through unchanged
    }
  }

  private applyActionSideEffects(action: PhaseAction, prev: GamePhase): void {
    // ── Campaign init ──
    if (action.type === 'new_game') {
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

    // ── Battle setup ──
    if (action.type === 'start_battle' || action.type === 'enter_battle') {
      GameState.lastEnemyPlacements = null;
    }

    // Snapshot all party members at battle start (before anyone can die)
    if (action.type === 'enter_battle') {
      const state = GameState.get();
      const participants: BattleParticipant[] = [];
      Object.entries(GameState.playerUnits).forEach(([templateId, us]) => {
        if (us.isInCamp) return;
        const bp = PLAYER_UNITS.find(b => b.templateId === templateId);
        if (!bp) return;
        const wasOnBench = state.benchUnits.some(b => b?.templateId === templateId);
        participants.push({ templateId, name: bp.name, level: us.level, isAlive: true, wasOnBench });
      });
      GameState.battleParticipants = participants;
    }

    // Snapshot all party members at debug battle start
    if (action.type === 'start_battle' && this.debugState) {
      const ds = this.debugState;
      const participants: BattleParticipant[] = [];
      for (const bp of PLAYER_UNITS) {
        if (ds.campUnitIds.includes(bp.templateId)) continue;
        participants.push({ templateId: bp.templateId, name: bp.name, level: ds.level, isAlive: true, wasOnBench: false });
      }
      GameState.battleParticipants = participants;
    }

    // ── Battle teardown ──
    if (action.type === 'exit_battle' && prev.type === 'battle') {
      if (prev.isDebug && this.debugState) {
        // Debug teardown: XP goes to DebugBattleState only — never touches GameState
        if (action.participants.length > 0) {
          this.debugState.level += 1;
        }
      } else {
        const state = GameState.get();

        // Level up all participants (field alive + field dead + bench) — not just state.units
        if (action.participants.length > 0) {
          action.participants.forEach((p) => {
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
          if (!unit.id.startsWith('p')) continue;
          const us = GameState.playerUnits[unit.templateId];
          if (us) GameState.playerUnits[unit.templateId] = { ...us, lastPlacement: unit.anchor };
        }

        // Mark trigger entity dead on the map
        if (prev.mapId && prev.triggerPos) {
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

  private readonly GAME_SCENES = ['MainMenu', 'WorldMap', 'Prep', 'Game', 'BattleResults', 'EquipScreen', 'DebugLevelSelect', 'UpgradeTreeScreen'];

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
      default: return;
    }
    for (const key of this.GAME_SCENES) {
      if (key !== nextScene && (sm.isActive(key) || sm.isPaused(key))) sm.stop(key);
    }
    sm.start(nextScene);
  }
}

// ─── Pure transition logic — no Phaser imports, no GameState access ───────────

export function resolveTransition(current: GamePhase, action: PhaseAction): GamePhase | null {
  switch (action.type) {

    case 'new_game':
      return { type: 'world_map', mapId: 'test_01', partyPos: MAP_DEFINITIONS['test_01'].startPos };

    case 'debug':
      return { type: 'debug_level_select' };

    case 'init_debug':
      return {
        type: 'debug_equip_screen',
        selectedUnitTemplateId: '',
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
        type: 'battle',
        enemyGroupId: action.enemyGroupId,
        returnPhase: current,
        triggerPos: action.triggerPos,
        mapId: current.mapId,
        participants: [],
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
        type: 'battle',
        enemyGroupId: action.enemyGroupId,
        returnPhase: current,
        isDebug: true,
        participants: [],
      };

    case 'exit_battle':
      if (current.type !== 'battle') return null;
      if (action.participants.length === 0) return current.returnPhase;
      return {
        type: 'battle_results',
        units: action.participants.map(p => ({ ...p, newLevel: p.level + 1 })),
        returnPhase: current.returnPhase,
      };

    case 'exit_results':
      if (current.type !== 'battle_results') return null;
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
  }

  return null;
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

export const PhaseManager = new PhaseManagerClass();
