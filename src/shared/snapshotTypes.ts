import type { UnitClassId, UnitBattleStatKey } from './unitTypes';
import type {
  ItemUseFailure,
  ItemEquipFailure,
  ItemDefinition,
  ItemRuntimeMetadata,
  ReadonlyItemUseEffect,
} from './itemTypes';

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
 *
 * `hp` carries CURRENT HP, not a resolved stat total: `maxHp` is the resolved
 * total, and it is `maxHp` that the HP row is colored from, so lost HP never
 * reads as an equipment debuff. `hp`'s pair is therefore always neutral
 * (`value === highlightBase`). Both producers — `core/battleSnapshotBuilder.ts`
 * (runtime HP) and `core/unitStatsSnapshot.ts` (persistent HP) — follow this.
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

// ─── Item Use Projections ─────────────────────────────────────────────────────
// Read-only UI projections for item use. They live here, beside the other snapshot contracts,
// so the render side can describe item eligibility without importing the modules that evaluate
// or execute a use.

/**
 * What a successful use would do to the selected character — structured data, never formatted
 * text (wording lives in `objects/itemUseEffectPresentation.ts`).
 *
 * The heal variant carries `restoredHp` — the CLAMPED result for this target, not the item's
 * nominal amount — because the clamping rule belongs to `progression/itemHealing.ts` and
 * must not be re-derived in the render layer. It deliberately carries no `nextHp`: that is
 * `currentHp + restoredHp`, and a stored copy could disagree with the fields it is derived from.
 */
export type ItemEffectPreview =
  | {
      type: 'permanent_stat_boost';
      stat: UnitBattleStatKey;
      amount: number;
      /** true only for stat === 'hp' — the boost also restores current HP by the same amount. */
      healsCurrentHp: boolean;
    }
  | {
      type: 'heal';
      /** The item's authored amount, before clamping to missing HP. */
      amount: number;
      /** min(amount, maxHp - currentHp) — always > 0, or the use would be ineligible. */
      restoredHp: number;
      currentHp: number;
      maxHp: number;
    };

/**
 * Eligibility of one item instance (backpack consumable or usable) against the currently
 * selected character.
 *
 * Produced by the same evaluation the executor runs (`core/itemUsability.ts`), so a prompt can
 * never advertise an action that confirmation would silently refuse.
 */
export type ItemUsability =
  | { canUse: true; effect: ItemEffectPreview }
  | { canUse: false; reason: ItemUseFailure };

/**
 * Everything the confirmation dialog needs, structured — never formatted text. Wording is
 * produced by `objects/itemUseEffectPresentation.ts`, which `core/` must not import.
 */
export interface PendingItemUsePrompt {
  instanceId:     string;
  unitTemplateId: string;
  unitName:       string;
  itemName:       string;
  effect:         ItemEffectPreview;
}

/**
 * The open item interaction as pure data — the only thing the pipeline carries between the
 * effects side that records it and the snapshot side that projects it. `closed` is the absence of
 * one (a null slot), so at most one modal can be open by construction.
 *
 * Its OWNER is not a field: storage is keyed by `PlayerSessionSource`, so an interaction cannot
 * claim a session it is not in. Declared here rather than in `core/itemInteractionStorage`
 * because that module is importer-restricted — the snapshot projection must be able to NAME this
 * type without gaining the ability to write the cell.
 */
export type ItemInteraction =
  | {
      readonly kind: 'choosing_action';
      readonly instanceId: string;
      readonly unitTemplateId: string;
    }
  | {
      readonly kind: 'confirming_use';
      readonly instanceId: string;
      readonly unitTemplateId: string;
    };

/** The gameplay actions an item-action window can offer. A semantic value, never a callback. */
export type ItemActionKind = 'use' | 'equip';

/**
 * One row of the item-action window. `disabledReason` is structured — the wording lives in
 * `objects/itemActionPresentation.ts`, which core/ must not import.
 */
export interface ItemActionOptionSnapshot {
  readonly action: ItemActionKind;
  readonly enabled: boolean;
  readonly disabledReason: ItemUseFailure | ItemEquipFailure | null;
}

/**
 * The open item-action window as pure data. Its enabled flags come from the same read-side
 * evaluators execution re-runs, so the window cannot offer an action the pipeline would refuse.
 */
export interface ItemActionMenuSnapshot {
  readonly instanceId: string;
  readonly unitTemplateId: string;
  readonly unitName: string;
  readonly itemName: string;
  /** Absent only for an item with no useEffect at all. */
  readonly effect: ReadonlyItemUseEffect | null;
  readonly options: readonly ItemActionOptionSnapshot[];
}
