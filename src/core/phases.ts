import type { UnitUpgradeStatLineSnapshot } from './unitUpgradePresentation';
export type { UnitUpgradeStatLineSnapshot };
import type {
  UnitStatValueSnapshot, UnitStatsSnapshot, SkillIconSnapshot,
  BackpackSnapshot, EquipmentSnapshot, UnitTabSnapshot,
} from '../shared/snapshotTypes';
export type { UnitStatValueSnapshot, UnitStatsSnapshot, SkillIconSnapshot };
import type { BenchUnitSnapshot, BattleUnitSnapshot, BattleOccupancySnapshot } from '../shared/battleSnapshots';
import type { PlacementSelection, BattleState, BattleMode } from '../battle/types';
import type { CellCoord } from '../shared/gridTypes';

export interface CampUnitSnapshot {
  templateId: string;
  name:       string;
  level:      number;
  inCamp:     boolean;
}

export interface UpgradeOptionSnapshot {
  id:           string;
  name:         string;
  description:  string;
  skill:        SkillIconSnapshot | null;
  statLines:    UnitUpgradeStatLineSnapshot[];
  spritePreview: string | null;
}

export interface UpgradeTierSnapshot {
  tierId:          5 | 10 | 15 | 20;
  options:         UpgradeOptionSnapshot[];
  chosenUpgradeId: string | null;
  isLocked:        boolean;
}

/** Snapshot of one player unit at moment of battle exit — pre-level-up. */
export interface BattleParticipant {
  templateId: string;
  name: string;
  level: number;       // current level BEFORE +1
  isAlive: boolean;
  wasOnBench: boolean;
  spriteKey: string | null;
}

/** Display data for BattleResults scene — level already incremented. */
export interface BattleResultUnit {
  templateId: string;
  name: string;
  newLevel: number;    // level AFTER +1
  isAlive: boolean;
  wasOnBench: boolean;
  spriteKey: string | null;
}

export type GamePhase =
  | { type: 'main_menu' }
  | { type: 'world_map'; mapId: string; partyPos: { x: number; y: number } }
  | { type: 'map_victory'; mapId: string }
  | { type: 'battle_results'; units: BattleResultUnit[]; returnPhase: GamePhase; mapCleared: boolean }
  | {
      type:               'battle';
      enemyGroupId:       string;
      returnPhase:        GamePhase;
      triggerPos?:        { x: number; y: number };
      mapId?:             string;
      isDebug?:           boolean;
      participants:       BattleParticipant[];     // battle-start snapshot; never rebuilt from current placement
      benchUnits:         (BenchUnitSnapshot | null)[]; // rebuilt by rebuildSnapshot after every placement action
      placementSelection: PlacementSelection;           // mirrors BattleState.placementSelection
      // ── Stage 4: scene-facing render data ─────────────────────────────────
      battlePhase:         BattleState['phase'];
      units:               BattleUnitSnapshot[];
      unitsById:           Map<string, BattleUnitSnapshot>;
      occupancy:           BattleOccupancySnapshot;
      roundQueue:          string[];
      activeUnitId:        string | null;
      activeUnit:          BattleUnitSnapshot | null;
      validTargets:        CellCoord[];
      targetHighlightKind: 'target' | 'heal_target' | 'none';
    }
  | { type: 'camp'; returnPhase: GamePhase; units: CampUnitSnapshot[] }
  | { type: 'debug_level_select' }
  | {
      type: 'debug_equip_screen';
      selectedUnitTemplateId: string;
      selectedUnitSpriteKey: string | null;
      selectedUnit: UnitTabSnapshot | null;
      availableUnits: UnitTabSnapshot[];
      backpack: BackpackSnapshot;
      unitEquipment: EquipmentSnapshot;
      unitStats: UnitStatsSnapshot | null;
      campUnitIds: string[];
      learnedSkills: SkillIconSnapshot[];
      upgradeSkills: SkillIconSnapshot[];
    }
  | {
      type: 'equip_screen';
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
  | { type: 'exit_battle'; participants: BattleParticipant[] }
  | { type: 'exit_results' }
  | { type: 'replay' }
  | { type: 'exit_to_menu' }
  // ── Equip screen navigation ────────────────────────────────────
  | { type: 'open_equip_screen'; unitTemplateId: string }
  | { type: 'close_equip_screen' }
  | { type: 'switch_equip_unit'; templateId: string }
  // ── Item mutations (mutation-only: resolveTransition returns same ref) ──
  | { type: 'equip_item'; instanceId: string; unitTemplateId: string }
  | { type: 'unequip_item'; unitTemplateId: string; slot: string }
  | { type: 'use_item'; instanceId: string; unitTemplateId: string }
  // ── Commerce (mutation-only) — stub, no shop phase yet ────────
  | { type: 'buy_item'; definitionId: string }
  | { type: 'sell_item'; instanceId: string }
  | { type: 'toggle_camp_unit'; templateId: string }
  | { type: 'open_upgrade_tree' }
  | { type: 'close_upgrade_tree' }
  | { type: 'choose_upgrade'; templateId: string; tierId: 5 | 10 | 15 | 20; upgradeId: string }
  // ── Debug battle ──────────────────────────────────────────────
  | { type: 'init_debug'; level: number }
  | { type: 'switch_debug_unit'; templateId: string }
  | { type: 'toggle_debug_camp'; templateId: string }
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
  | { type: 'battle_quick_turn'; unitId: string };

// Empty snapshots used by resolveTransition as placeholders —
// rebuildSnapshot fills them with real data after side effects run.
export const EMPTY_BACKPACK_SNAPSHOT: BackpackSnapshot = { slots: Array(24).fill(null) };
export const EMPTY_EQUIP_SNAPSHOT: EquipmentSnapshot = { slots: {} };
