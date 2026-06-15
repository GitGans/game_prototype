import type { ItemDefinition, ItemInstance, ItemContainer } from '../shared/itemTypes';
import type { StartingItemDefinition } from '../data/startingInventoryDefinitions';
import { resolvePreferredEquipSlot } from './equipmentSlotResolver';

export interface BuildStartingInventoryInput {
  playerUnitTemplateIds: readonly string[];
  itemDefinitions: Record<string, ItemDefinition>;
  startingItems: readonly StartingItemDefinition[];
  backpackId?: string;
}

export interface BuildStartingInventoryResult {
  itemInstances: Record<string, ItemInstance>;
  itemContainers: Record<string, ItemContainer>;
}

/**
 * Pure builder: converts static starting-item content into runtime item instances and
 * containers. Does NOT check class restrictions (that needs progression, which inventory/
 * may not import) — callers run assertStartingEquipmentClassRestrictions separately.
 * Throws on invalid content; inputs are never mutated.
 *
 * Invariant: items are processed in array order and each placed item is written into
 * `itemContainers` BEFORE the next item is resolved. This makes ring placement
 * deterministic (first ring on a unit → ring_1, second → ring_2, third → throws). Do not
 * refactor into a resolve-all-then-place pass; that would break ring slot assignment.
 */
export function buildStartingInventory(input: BuildStartingInventoryInput): BuildStartingInventoryResult {
  const { playerUnitTemplateIds, itemDefinitions, startingItems, backpackId = 'backpack_shared' } = input;

  const itemInstances: Record<string, ItemInstance> = {};
  const itemContainers: Record<string, ItemContainer> = {
    [backpackId]: { id: backpackId, kind: 'backpack', slots: {} },
  };
  for (const templateId of playerUnitTemplateIds) {
    itemContainers[`equip_${templateId}`] = {
      id: `equip_${templateId}`, kind: 'equipment', ownerTemplateId: templateId, slots: {},
    };
  }

  for (const item of startingItems) {
    if (itemInstances[item.instanceId]) {
      throw new Error(`Duplicate starting item instanceId: "${item.instanceId}"`);
    }
    const def = itemDefinitions[item.itemDefinitionId];
    if (!def) {
      throw new Error(`Starting item "${item.instanceId}" references unknown itemDefinitionId "${item.itemDefinitionId}"`);
    }
    itemInstances[item.instanceId] = { id: item.instanceId, definitionId: item.itemDefinitionId };

    if (item.placement.kind === 'backpack') {
      const { slot } = item.placement;
      const n = Number(slot);
      if (!Number.isInteger(n) || n < 0 || n > 23) {
        throw new Error(`Starting item "${item.instanceId}" has out-of-range backpack slot "${slot}" (0..23)`);
      }
      const backpack = itemContainers[backpackId];
      if (backpack.slots[slot] !== undefined) {
        throw new Error(`Backpack slot "${slot}" already occupied (item "${item.instanceId}")`);
      }
      backpack.slots[slot] = item.instanceId;
    } else {
      const { unitTemplateId } = item.placement;
      const container = itemContainers[`equip_${unitTemplateId}`];
      if (!container) {
        throw new Error(`Equipped starting item "${item.instanceId}" targets unknown unit "${unitTemplateId}"`);
      }
      const resolved = resolvePreferredEquipSlot(def, container);
      if (!resolved.ok) {
        if (resolved.reason === 'not_equippable') {
          throw new Error(`Equipped starting item "${item.instanceId}" is not equippable (equipSlot is null)`);
        }
        // no_free_ring_slot — starting content must NOT swap (unlike equipItem)
        throw new Error(`No free ring slot for starting item "${item.instanceId}" on unit "${unitTemplateId}"`);
      }
      const slot = resolved.slot;
      // Defensive guard: catches two non-ring items authored into the same slot.
      // (For rings this never fires — the resolver only returns a free ring slot.)
      if (container.slots[slot] !== undefined) {
        throw new Error(`Equipment slot "${slot}" on "${unitTemplateId}" already occupied (item "${item.instanceId}")`);
      }
      container.slots[slot] = item.instanceId;
    }
  }

  return { itemInstances, itemContainers };
}
