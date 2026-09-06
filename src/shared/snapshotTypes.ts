import type { UnitClassId, UnitBattleStatKey } from './unitTypes';
import type { ConsumableUseFailure, ItemDefinition, ItemRuntimeMetadata } from './itemTypes';

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

// ─── Consumable Use Projections ───────────────────────────────────────────────
// Read-only UI projections for consumable use. They live here, beside the other snapshot
// contracts, so the render side can describe consumable eligibility without importing the
// modules that evaluate or execute a use.

/**
 * Eligibility of one consumable instance against the currently selected character.
 *
 * Produced by the same evaluation the executor runs (`core/consumableUsability.ts`), so a prompt
 * can never advertise an action that confirmation would silently refuse.
 */
export type ConsumableUsability =
  | { canUse: true; effect: { stat: UnitBattleStatKey; amount: number; healsCurrentHp: boolean } }
  | { canUse: false; reason: ConsumableUseFailure };

/**
 * A pending confirmation as pure data — the only thing the pipeline carries between the effects
 * side that records it and the snapshot side that projects it. Its OWNER is not a field: the
 * store is keyed by `PlayerSessionSource`, so a request cannot claim a session it is not in.
 */
export interface PendingConsumeRequest {
  readonly instanceId: string;
  readonly unitTemplateId: string;
}

/**
 * Everything the confirmation dialog needs, structured — never formatted text. Wording is
 * produced by `objects/itemUseEffectPresentation.ts`, which `core/` must not import.
 */
export interface PendingConsumePrompt {
  instanceId:     string;
  unitTemplateId: string;
  unitName:       string;
  itemName:       string;
  stat:           UnitBattleStatKey;
  amount:         number;
  /** true only for stat === 'hp' — the boost also restores current HP by the same amount. */
  healsCurrentHp: boolean;
}
