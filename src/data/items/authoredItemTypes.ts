import type { BattleStatBonuses, EquipSlot, ItemUseEffect } from '../../shared/itemTypes';
import type { UnitClassId } from '../../shared/unitTypes';

/**
 * Ordinary equipment slots only — never the runtime-only ring_1/ring_2 keys, and never
 * 'usable_slot' (reserved exclusively for kind 'usable').
 */
export type EquipmentAuthoredSlot = Exclude<EquipSlot, 'ring_1' | 'ring_2' | 'usable_slot'>;

/**
 * Per-item authored facts. The item id is the Record key in the group, NOT a field here.
 * Authored entries MUST NOT contain id, usage, equipSlot, slot, subclass, or mapStatBonuses —
 * behavior and placement come from the group and are generated into ItemRuntimeMetadata.
 */
export interface AuthoredItem {
  name: string;
  buyPrice: number;
  battleStatBonuses?: Partial<BattleStatBonuses>; // builder zero-fills missing stats
  allowedClassIds?: UnitClassId[];
  useEffect?: ItemUseEffect;
  sprite?: string;
}

export interface EquipmentItemGroup {
  kind: 'equipment';
  slot: EquipmentAuthoredSlot;     // ordinary gear only — usable_slot is forbidden here
  items: Record<string, AuthoredItem>;
}

export interface UsableItemGroup {
  kind: 'usable';
  slot: 'usable_slot';             // usable groups ALWAYS use this slot — and only this slot
  items: Record<string, AuthoredItem>;
}

export interface ConsumableItemGroup {
  kind: 'consumable';
  items: Record<string, AuthoredItem>;
}

export type ItemGroup = EquipmentItemGroup | UsableItemGroup | ConsumableItemGroup;
