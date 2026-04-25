import {
  UnitProgressionStatModifiers,
  BackpackSnapshot,
  EquipmentSnapshot,
  UnitTabSnapshot,
  DamageType,
  SkillActionType,
} from '../battle/types';

export interface CampUnitSnapshot {
  templateId: string;
  name:       string;
  level:      number;
  inCamp:     boolean;
}

export interface SkillIconSnapshot {
  id:          string;
  name:        string;
  description: string;
  damageType:  DamageType | null;
  actionType:  SkillActionType;
}

export interface UpgradeOptionSnapshot {
  id:            string;
  name:          string;
  description:   string;
  skill:         SkillIconSnapshot | null;
  statModifiers: UnitProgressionStatModifiers;
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

export interface UnitStatValueSnapshot {
  base: number;   // blueprint + level scaling only
  value: number;  // final: base + upgrade modifiers + equipment + permanent bonuses
}

export interface UnitStatsSnapshot {
  level: number;
  hp:              UnitStatValueSnapshot;
  maxHp:           UnitStatValueSnapshot;
  physicalDamage:  UnitStatValueSnapshot;
  magicalDamage:   UnitStatValueSnapshot;
  physicalDefense: UnitStatValueSnapshot;
  magicalDefense:  UnitStatValueSnapshot;
  dodge:           UnitStatValueSnapshot;
  block:           UnitStatValueSnapshot;
  initiative:      UnitStatValueSnapshot;
}

export type GamePhase =
  | { type: 'main_menu' }
  | { type: 'world_map'; mapId: string; partyPos: { x: number; y: number } }
  | { type: 'map_victory'; mapId: string }
  | { type: 'battle_results'; units: BattleResultUnit[]; returnPhase: GamePhase; mapCleared: boolean }
  | {
      type: 'battle';
      enemyGroupId: string;
      returnPhase: GamePhase;
      triggerPos?: { x: number; y: number };
      mapId?: string;
      isDebug?: boolean;
      participants: BattleParticipant[];
    }
  | { type: 'camp'; returnPhase: GamePhase; units: CampUnitSnapshot[] }
  | { type: 'debug_level_select' }
  | {
      type: 'debug_equip_screen';
      selectedUnitTemplateId: string;
      selectedUnitSpriteKey: string | null;
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
  | { type: 'toggle_debug_camp'; templateId: string };

// Empty snapshots used by resolveTransition as placeholders —
// rebuildSnapshot fills them with real data after side effects run.
export const EMPTY_BACKPACK_SNAPSHOT: BackpackSnapshot = { slots: Array(24).fill(null) };
export const EMPTY_EQUIP_SNAPSHOT: EquipmentSnapshot = { slots: {} };
