import type { UnitUpgradeStatLineSnapshot } from './unitUpgradePresentation';
export type { UnitUpgradeStatLineSnapshot };
import type {
  UnitStatValueSnapshot, UnitStatsSnapshot, SkillIconSnapshot,
  BackpackSnapshot, EquipmentSnapshot, UnitTabSnapshot,
} from '../shared/snapshotTypes';
export type { UnitStatValueSnapshot, UnitStatsSnapshot, SkillIconSnapshot };
import type { BattleUnitSnapshot, FieldBattleUnitSnapshot, BattleOccupancySnapshot, BattleFieldUnitCellsSnapshot } from '../shared/battleSnapshots';
import type { PlacementSelection, BattleState, BattleMode, Side } from '../battle/types';
import type { CellCoord } from '../shared/gridTypes';
import type { UpgradeOptionId } from '../shared/unitTypes';
import type { SubMapState, WorldPos } from '../shared/worldTypes';
import type { PlayerSessionSource } from './playerSessionState';
import type { BattleParticipant, BattleExitOutcome } from './battleRuntimeContext';
export type { BattleExitOutcome };

export interface CampUnitSnapshot {
  templateId: string;
  name:       string;
  level:      number;
  inCamp:     boolean;
  isAlive:    boolean;
}

export interface UpgradeOptionSnapshot {
  id:                    UpgradeOptionId;
  name:                  string;
  skill:                 SkillIconSnapshot;   // never null — every option grants a skill
  statLines:             UnitUpgradeStatLineSnapshot[];
  unitPreviewTextureKey: string | null;
  classChangeName:       string | null;
}

export interface UpgradeTierSnapshot {
  tierId:          5 | 10 | 15 | 20;
  options:         UpgradeOptionSnapshot[];
  chosenUpgradeId: UpgradeOptionId | null;
  isLocked:        boolean;
}

/**
 * Immutable presentation metadata carried from a battle attempt into `battle_results`.
 * Deliberately excludes `level` and `isAlive`: final level and life state always come
 * from the roster selected by `sessionSource`.
 */
export interface BattleResultParticipantSeed {
  templateId: string;
  name:       string;
  wasOnBench: boolean;
  spriteKey:  string | null;
}

/** Display data for BattleResults scene — rebuilt from the final stored roster. */
export interface BattleResultUnit {
  templateId: string;
  name: string;
  newLevel: number;    // final persisted level
  isAlive: boolean;
  wasOnBench: boolean;
  spriteKey: string | null;
}

export type GamePhase =
  | { type: 'main_menu' }
  | {
      type: 'world_map';
      mapId: string;
      partyPos: WorldPos;
      mapState: SubMapState;
      selectedForBattleUnitCount: number;
      activeLivingUnitCount: number;
      canStartBattle: boolean;
    }
  | { type: 'map_victory'; mapId: string }
  | {
      type:             'battle_results';
      sessionSource:    PlayerSessionSource;
      // Immutable presentation metadata only. Final level and life state always come
      // from the roster selected by `sessionSource` — never from a battle-start snapshot.
      participantSeeds: BattleResultParticipantSeed[];
      units:            BattleResultUnit[];   // rebuilt by rebuildSnapshot from the stored roster
      returnPhase:      GamePhase;
      mapCleared:       boolean;
    }
  | {
      type:               'battle';
      sessionSource:      PlayerSessionSource;
      enemyGroupId:       string;
      returnPhase:        GamePhase;
      triggerPos?:        { x: number; y: number };
      mapId?:             string;
      participants:       BattleParticipant[];     // battle-start snapshot; never rebuilt from current placement
      benchUnits:         (BattleUnitSnapshot | null)[]; // rebuilt by rebuildSnapshot after every placement action
      placementSelection: PlacementSelection;           // mirrors BattleState.placementSelection
      battlePhase:         BattleState['phase'];
      // Placement-phase control state: at least one LIVING player unit is
      // field-deployed. Computed by battle/combatStart.ts; scenes read it and
      // never recompute field membership or life state themselves.
      canBeginCombat:      boolean;
      // Field-only narrowed view. Includes dead field units (rendered as
      // corpses by UI). Intended iteration source for any code that reads
      // anchor or does cell math.
      fieldUnits:          FieldBattleUnitSnapshot[];
      // Full id lookup over all runtime units (alive/dead, field/bench).
      // This is the battle phase's full read model; there is no separate `units` array.
      unitsById:           Map<string, BattleUnitSnapshot>;
      // Living/blocking only.
      occupancy:           BattleOccupancySnapshot;
      // All field bodies (alive + dead, both sides). For corpse hover.
      fieldUnitCells:      BattleFieldUnitCellsSnapshot;
      roundQueue:          string[];
      activeUnitId:        string | null;
      // Active unit is always field-deployed (round queue is field-only).
      activeUnit:          FieldBattleUnitSnapshot | null;
      battleMode:              BattleMode;
      activeUnitSide:          Side | null;
      manualTurnControlsVisible: boolean;
      manualChargeDisabled:    boolean;
      validTargets:        CellCoord[];
      targetHighlightKind: 'target' | 'heal_target' | 'revive_target' | 'none';
      // Manual-targeting preview, projected from BattleState.previewTargetCoord.
      // previewTargetUnitId is the *primary* clicked unit only (never AoE-expanded).
      previewTargetCoord:  CellCoord | null;
      previewTargetUnitId: string | null;
    }
  | {
      type: 'camp';
      sessionSource: 'campaign';
      returnPhase: GamePhase;
      units: CampUnitSnapshot[];
      selectedForBattleUnitCount: number;
      activeLivingUnitCount: number;
      canStartBattle: boolean;
    }
  | { type: 'debug_level_select' }
  | {
      type: 'debug_equip_screen';
      sessionSource: 'debug';
      selectedUnitTemplateId: string;
      selectedUnitSpriteKey: string | null;
      selectedUnit: UnitTabSnapshot | null;
      availableUnits: UnitTabSnapshot[];
      backpack: BackpackSnapshot;
      unitEquipment: EquipmentSnapshot;
      unitStats: UnitStatsSnapshot | null;
      campUnitIds: string[];
      selectedForBattleUnitCount: number;
      activeLivingUnitCount: number;
      canStartBattle: boolean;
      learnedSkills: SkillIconSnapshot[];
      upgradeSkills: SkillIconSnapshot[];
    }
  | {
      type: 'equip_screen';
      sessionSource: 'campaign';
      selectedUnitTemplateId: string;
      selectedUnitSpriteKey: string | null;
      selectedUnit: UnitTabSnapshot | null;
      returnPhase: GamePhase;
      backpack: BackpackSnapshot;
      unitEquipment: EquipmentSnapshot;
      availableUnits: UnitTabSnapshot[];
      unitStats: UnitStatsSnapshot | null;
      learnedSkills: SkillIconSnapshot[];
      upgradeSkills: SkillIconSnapshot[];
    }
  | {
      type: 'upgrade_tree';
      sessionSource: PlayerSessionSource;
      unitTemplateId: string;
      unitName: string;
      returnPhase: GamePhase;
      upgradeTiers: UpgradeTierSnapshot[];
    };

export type UpgradeTreePhase = Extract<GamePhase, { type: 'upgrade_tree' }>;

export type PhaseAction =
  // ── Existing ──────────────────────────────────────────────────
  | { type: 'new_game' }               // replaces 'play'
  | { type: 'debug' }
  | { type: 'enter_battle'; enemyGroupId: string; triggerPos: { x: number; y: number } }
  | { type: 'enter_camp' }
  | { type: 'exit_camp' }
  | { type: 'start_battle'; enemyGroupId: string }
  | { type: 'exit_battle'; outcome: BattleExitOutcome }
  | { type: 'exit_results' }
  | { type: 'replay' }
  | { type: 'exit_to_menu' }
  | { type: 'move_party'; partyPos: WorldPos }
  // ── Equip screen navigation ────────────────────────────────────
  | { type: 'open_equip_screen'; unitTemplateId: string }
  | { type: 'close_equip_screen' }
  | { type: 'switch_equip_unit'; templateId: string }
  // ── Item mutations (mutation-only: resolveTransition returns same ref) ──
  | { type: 'equip_item'; instanceId: string; unitTemplateId: string }
  | { type: 'unequip_item'; unitTemplateId: string; slot: string }
  // ── Commerce (mutation-only) — stub, no shop phase yet ────────
  | { type: 'buy_item'; definitionId: string }
  | { type: 'sell_item'; instanceId: string }
  | { type: 'toggle_camp_unit'; templateId: string }
  | { type: 'open_upgrade_tree' }
  | { type: 'close_upgrade_tree' }
  | { type: 'choose_upgrade'; tierId: 5 | 10 | 15 | 20; upgradeId: UpgradeOptionId }
  // ── Debug battle ──────────────────────────────────────────────
  | { type: 'init_debug'; level: number }
  | { type: 'return_to_debug_level_select' }
  | { type: 'switch_debug_unit'; templateId: string }
  // ── Battle placement (mutation-only: resolveTransition returns current) ──
  | { type: 'select_bench_slot';          benchIdx: number }
  | { type: 'select_field_unit';          unitId:   string }
  | { type: 'clear_placement_selection' }
  | { type: 'place_bench_unit';           benchIdx: number; anchor: CellCoord }
  | { type: 'swap_bench_with_field';      benchIdx: number; fieldUnitId: string }
  | { type: 'move_field_unit';            unitId:   string; anchor: CellCoord }
  | { type: 'move_field_unit_to_bench';   unitId:   string; benchIdx: number }
  | { type: 'return_field_unit_to_bench'; unitId:   string }
  | { type: 'swap_field_units';           unitAId:  string; unitBId: string }
  // ── Battle lifecycle actions (mutation-only: resolveTransition returns current) ──
  | { type: 'battle_begin_combat' }
  | { type: 'battle_mark_quick_battle_complete' }
  // ── Battle control (mutation-only: resolveTransition returns current) ──
  | { type: 'battle_set_mode'; mode: BattleMode }
  | { type: 'battle_prepare_quick_battle' }
  // ── Battle turn actions (mutation-only: resolveTransition returns current) ──
  | { type: 'battle_start_turn' }
  | { type: 'battle_select_skill'; skillIndex: number }
  | { type: 'battle_use_skill'; unitId: string; target: CellCoord; skillIndex?: number }
  | { type: 'battle_advance_turn' }
  | { type: 'battle_skip_turn'; reason?: 'manual_skip' | 'blocked_melee' }
  | { type: 'battle_charge_turn' }
  | { type: 'battle_quick_turn'; unitId: string }
  | { type: 'battle_decide_auto_turn' }
  | { type: 'battle_apply_auto_turn' }
  // ── Battle preview target (mutation-only: resolveTransition returns current) ──
  | { type: 'battle_preview_target'; target: CellCoord }
  | { type: 'battle_clear_preview_target' };

// Empty snapshots used by resolveTransition as placeholders —
// rebuildSnapshot fills them with real data after side effects run.
export const EMPTY_BACKPACK_SNAPSHOT: BackpackSnapshot = { slots: Array(24).fill(null) };
export const EMPTY_EQUIP_SNAPSHOT: EquipmentSnapshot = { slots: {} };
