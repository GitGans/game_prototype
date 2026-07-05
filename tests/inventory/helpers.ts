import type {
  ItemCatalog,
  ItemContainer,
  ItemInstance,
  ItemDefinition,
  ItemRuntimeKind,
  ItemRuntimeMetadata,
  BattleStatBonuses,
  EquipSlot,
  ItemUseEffect,
} from "../../src/shared/itemTypes";
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
  /** Generated metadata fields — defaulted to an equippable helmet. `slot: null` = not equippable. */
  kind?: ItemRuntimeKind;
  slot?: EquipSlot | null;
  allowedClassIds?: string[];
  battleStatBonuses?: Partial<BattleStatBonuses>;
  buyPrice?: number;
  useEffect?: ItemUseEffect;
}

/** Builds an item-facts definition (no behavior/slot — those live in metadata). */
export function def(id: string, opts: DefOpts = {}): ItemDefinition {
  return {
    id,
    name: id,
    battleStatBonuses: { ...zeroBonuses, ...(opts.battleStatBonuses ?? {}) },
    buyPrice: opts.buyPrice ?? 100,
    ...(opts.allowedClassIds ? { allowedClassIds: opts.allowedClassIds.map(ucid) } : {}),
    ...(opts.useEffect ? { useEffect: opts.useEffect } : {}),
  };
}

/** Builds runtime metadata for an item; defaults to an equippable helmet. */
export function meta(opts: DefOpts = {}): ItemRuntimeMetadata {
  return {
    kind: opts.kind ?? "equipment",
    slot: opts.slot === undefined ? "helmet" : opts.slot,
  };
}

/** Builds an ItemCatalog from one or more (id, opts) entries. */
export function catalog(entries: Record<string, DefOpts>): ItemCatalog {
  const definitions: Record<string, ItemDefinition> = {};
  const metadataById: Record<string, ItemRuntimeMetadata> = {};
  for (const [id, opts] of Object.entries(entries)) {
    definitions[id] = def(id, opts);
    metadataById[id] = meta(opts);
  }
  return { definitions, metadataById };
}

/** Wraps an existing definitions map plus per-id metadata into a catalog. */
export function catalogFrom(
  definitions: Record<string, ItemDefinition>,
  metadataById: Record<string, ItemRuntimeMetadata>,
): ItemCatalog {
  return { definitions, metadataById };
}

/** Fills backpack slots '0'..'(n-1)' with throwaway occupant ids. */
export function fillBackpack(container: ItemContainer, n: number): void {
  for (let i = 0; i < n; i++) container.slots[String(i)] = `occupant_${i}`;
}
