import type { UnitClassId, UnitBattleStatKey } from './unitTypes';
import type { ItemDefinition, ItemRuntimeMetadata } from './itemTypes';

// ─── Stat Snapshots ───────────────────────────────────────────────────────────

export interface UnitStatValueSnapshot {
  highlightBase: number;  // value used ONLY for color comparison: level + tier + permanent (no equipment, no battle effects)
  value:         number;  // value shown to the player: highlightBase + equipment (+ active battle effects in battle)
}

/**
 * Every canonical battle stat, keyed by UnitBattleStatKey, plus the two
 * fields that aren't part of the additive stat model: level (metadata) and
 * maxHp (hp's ceiling — a distinct concept from hp's current value).
 * Adding a 9th battle stat updates this automatically; no manual field to add.
 */
export type UnitStatsSnapshot =
  Record<UnitBattleStatKey, UnitStatValueSnapshot> & {
    level: number;
    maxHp: UnitStatValueSnapshot;
  };

export type SkillIconColorKind = 'physical' | 'magical' | 'neutral';

export interface SkillIconSnapshot {
  id:             string;
  name:           string;
  iconTextureKey: string | null;  // prepared skill-icon texture key, or null when no art
  description:    string;
  tag:            string;
  colorKind:      SkillIconColorKind;
}

// ─── Item Snapshots ───────────────────────────────────────────────────────────

export interface ItemSlotSnapshot {
  instanceId: string;
  definition: ItemDefinition;
  metadata: ItemRuntimeMetadata;
}

export interface BackpackSnapshot {
  // 10 slots in order; null = empty slot
  slots: Array<ItemSlotSnapshot | null>;
}

export interface EquipmentSnapshot {
  // keyed by EquipSlot strings (ring_1, helmet, etc.); absent key = empty slot
  slots: Partial<Record<string, ItemSlotSnapshot>>;
}

// ─── Unit Tab Snapshot ────────────────────────────────────────────────────────

export interface UnitTabSnapshot {
  templateId: string;
  name:       string;
  classId:    UnitClassId;
  className:  string;
  spriteKey:  string | null;
}
