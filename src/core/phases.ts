import {
  BackpackSnapshot,
  EquipmentSnapshot,
  UnitTabSnapshot,
} from '../battle/types';

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
    }
  | { type: 'camp'; returnPhase: GamePhase }
  | { type: 'debug_prep' }
  | {
      type: 'equip_screen';
      selectedUnitTemplateId: string;
      returnPhase: GamePhase;
      backpack: BackpackSnapshot;
      unitEquipment: EquipmentSnapshot;
      availableUnits: UnitTabSnapshot[];
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
  | { type: 'sell_item'; instanceId: string };

// Empty snapshots used by resolveTransition as placeholders —
// rebuildSnapshot fills them with real data after side effects run.
export const EMPTY_BACKPACK_SNAPSHOT: BackpackSnapshot = { slots: Array(24).fill(null) };
export const EMPTY_EQUIP_SNAPSHOT: EquipmentSnapshot = { slots: {} };
