import type { DamageType, SkillActionType } from './skillTypes';
import type { UnitClass } from './unitTypes';
import type { ItemDefinition } from './itemTypes';

// ─── Stat Snapshots ───────────────────────────────────────────────────────────

export interface UnitStatValueSnapshot {
  base:  number;  // blueprint + level scaling only
  value: number;  // final: base + upgrade modifiers + equipment + permanent bonuses
}

export interface UnitStatsSnapshot {
  level:           number;
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

export interface SkillIconSnapshot {
  id:          string;
  name:        string;
  description: string;
  damageType:  DamageType | null;
  actionType:  SkillActionType;
}

// ─── Item Snapshots ───────────────────────────────────────────────────────────

export interface ItemSlotSnapshot {
  instanceId: string;
  definition: ItemDefinition;
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
  unitClass:  UnitClass;
  spriteKey:  string | null;
}
