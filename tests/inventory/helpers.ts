import type { ItemContainer, ItemInstance, ItemDefinition, BattleStatBonuses, EquipSlot, ItemUseEffect, ItemUsage } from "../../src/shared/itemTypes";
import { ucid } from "../../src/shared/unitTypes";

export const zeroBonuses: BattleStatBonuses = {
  hp: 0, physicalStrength: 0, magicalStrength: 0, physicalDefense: 0, magicalDefense: 0,
};

export function backpack(id: string, slots: Record<string, string> = {}): ItemContainer {
  return { id, kind: "backpack", slots: { ...slots } };
}

export function equipment(unitTemplateId: string, slots: Record<string, string> = {}): ItemContainer {
  return { id: `equip_${unitTemplateId}`, kind: "equipment", ownerTemplateId: unitTemplateId, slots: { ...slots } };
}

export function instance(id: string, definitionId: string): ItemInstance {
  return { id, definitionId };
}

export interface DefOpts {
  equipSlot?: EquipSlot | null;
  usage?: ItemUsage;
  allowedClassIds?: string[];
  battleStatBonuses?: Partial<BattleStatBonuses>;
  buyPrice?: number;
  useEffect?: ItemUseEffect;
}

export function def(id: string, opts: DefOpts = {}): ItemDefinition {
  return {
    id,
    name: id,
    usage: opts.usage ?? "equip",
    equipSlot: opts.equipSlot === undefined ? "helmet" : opts.equipSlot,
    battleStatBonuses: { ...zeroBonuses, ...(opts.battleStatBonuses ?? {}) },
    buyPrice: opts.buyPrice ?? 100,
    ...(opts.allowedClassIds ? { allowedClassIds: opts.allowedClassIds.map(ucid) } : {}),
    ...(opts.useEffect ? { useEffect: opts.useEffect } : {}),
  };
}

/** Fills backpack slots '0'..'(n-1)' with throwaway occupant ids. */
export function fillBackpack(container: ItemContainer, n: number): void {
  for (let i = 0; i < n; i++) container.slots[String(i)] = `occupant_${i}`;
}
