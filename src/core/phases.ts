import {
  BattleStatBonuses,
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

export interface SkillOptionSnapshot {
  id:          string;
  name:        string;
  description: string;
  damageType:  DamageType | null;
  actionType:  SkillActionType;
}

export interface SkillTierSnapshot {
  tierId: 0 | 5 | 10 | 15 | 20;
  options: SkillOptionSnapshot[];
  chosenSkillId: string | null; // null = not yet chosen (level reached)
  isLocked: boolean;            // true = level not yet reached
}

export type GamePhase =
  | { type: 'main_menu' }
  | { type: 'world_map'; mapId: string; partyPos: { x: number; y: number } }
  | { type: 'map_victory'; mapId: string }
  | {
      type: 'battle';
      enemyGroupId: string;
      returnPhase: GamePhase;
      triggerPos?: { x: number; y: number };
      mapId?: string;
      isDebug?: boolean;
    }
  | { type: 'camp'; returnPhase: GamePhase; units: CampUnitSnapshot[] }
  | { type: 'debug_level_select' }
  | {
      type: 'debug_equip_screen';
      selectedUnitTemplateId: string;
      availableUnits: UnitTabSnapshot[];
      backpack: BackpackSnapshot;
      unitEquipment: EquipmentSnapshot;
      unitStats: { level: number; equippedBonuses: BattleStatBonuses } | null;
      campUnitIds: string[];
      skillTiers: SkillTierSnapshot[];
    }
  | {
      type: 'equip_screen';
      selectedUnitTemplateId: string;
      returnPhase: GamePhase;
      backpack: BackpackSnapshot;
      unitEquipment: EquipmentSnapshot;
      availableUnits: UnitTabSnapshot[];
      unitStats: { level: number; equippedBonuses: BattleStatBonuses } | null;
      skillTiers: SkillTierSnapshot[];
    };

export type PhaseAction =
  // ── Existing ──────────────────────────────────────────────────
  | { type: 'new_game' }               // replaces 'play'
  | { type: 'debug' }
  | { type: 'enter_battle'; enemyGroupId: string; triggerPos: { x: number; y: number } }
  | { type: 'enter_camp' }
  | { type: 'exit_camp' }
  | { type: 'start_battle'; enemyGroupId: string }
  | { type: 'exit_battle' }
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
  | { type: 'choose_skill'; templateId: string; tierId: 0 | 5 | 10 | 15 | 20; skillId: string }
  // ── Debug battle ──────────────────────────────────────────────
  | { type: 'init_debug'; level: number }
  | { type: 'switch_debug_unit'; templateId: string }
  | { type: 'toggle_debug_camp'; templateId: string };

// Empty snapshots used by resolveTransition as placeholders —
// rebuildSnapshot fills them with real data after side effects run.
export const EMPTY_BACKPACK_SNAPSHOT: BackpackSnapshot = { slots: Array(24).fill(null) };
export const EMPTY_EQUIP_SNAPSHOT: EquipmentSnapshot = { slots: {} };
