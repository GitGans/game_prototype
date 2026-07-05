import type {
  EquipSlot,
  ItemCatalog,
  ItemDefinition,
  ItemRuntimeKind,
  ItemRuntimeMetadata,
} from '../../shared/itemTypes';
import type { ItemGroup } from './authoredItemTypes';
import { createZeroBattleStatMap } from '../../shared/battleStatUtils';

const KINDS_REQUIRING_USE_EFFECT: ReadonlySet<ItemRuntimeKind> = new Set(['usable', 'consumable']);

/**
 * Pure builder: turns authored item groups into the generated catalog. Group array order and
 * per-group key order are preserved. The group is the single source of truth for behavior (kind)
 * and placement (slot); item definitions carry facts only.
 *
 * useEffect ownership by kind (enforced here):
 *   equipment  → useEffect forbidden
 *   usable     → useEffect required (data only)
 *   consumable → useEffect required (data only)
 *
 * slot invariant by kind (enforced here):
 *   equipment  → ordinary equipment slot only, NEVER usable_slot
 *   usable     → slot MUST be usable_slot (reserved exclusively for kind 'usable')
 *   consumable → slot null
 */
export function buildItemCatalog(groups: readonly ItemGroup[]): ItemCatalog {
  const definitions: Record<string, ItemDefinition> = {};
  const metadataById: Record<string, ItemRuntimeMetadata> = {};

  for (const group of groups) {
    const slot: EquipSlot | null = group.kind === 'consumable' ? null : group.slot;
    // usable_slot belongs exclusively to kind 'usable' — guard both directions.
    if (group.kind === 'usable' && slot !== 'usable_slot') {
      throw new Error(`Usable group must use slot 'usable_slot' (got "${slot}")`);
    }
    // Cast: EquipmentAuthoredSlot excludes 'usable_slot' at the type level, so this guard
    // exists to reject malformed JS/test data that bypasses the literal type.
    if (group.kind === 'equipment' && (group.slot as string) === 'usable_slot') {
      throw new Error(`Equipment group must not use slot 'usable_slot'`);
    }
    for (const [id, item] of Object.entries(group.items)) {
      if (definitions[id]) throw new Error(`Duplicate item id "${id}"`);
      if (KINDS_REQUIRING_USE_EFFECT.has(group.kind) && !item.useEffect) {
        throw new Error(`Item "${id}" of kind "${group.kind}" requires a useEffect`);
      }
      if (group.kind === 'equipment' && item.useEffect) {
        throw new Error(`Item "${id}" of kind "equipment" must not have a useEffect`);
      }

      definitions[id] = {
        id,
        name: item.name,
        buyPrice: item.buyPrice,
        battleStatBonuses: { ...createZeroBattleStatMap(), ...(item.battleStatBonuses ?? {}) },
        ...(item.allowedClassIds ? { allowedClassIds: item.allowedClassIds } : {}),
        ...(item.useEffect ? { useEffect: item.useEffect } : {}),
        ...(item.sprite ? { sprite: item.sprite } : {}),
      };
      metadataById[id] = { kind: group.kind, slot };
    }
  }

  return { definitions, metadataById };
}
