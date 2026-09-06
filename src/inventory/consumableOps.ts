import type {
  ConsumableLocationFailure, ItemCatalog, ItemDefinition, ItemUseEffect,
} from '../shared/itemTypes';
import type { InventoryState } from './inventoryState';
import { requireSharedBackpack } from './inventoryState';
import { applySlotChanges } from './containerOps';

/**
 * Consumable resolution and destruction. Pure: inputs are never mutated, the catalog is passed in,
 * and the shared backpack is identified structurally (`requireSharedBackpack`) — never by
 * container id.
 *
 * This module knows nothing about what an effect DOES. It resolves the item, proves it is safely
 * removable, and removes it; applying the effect belongs to progression.
 */

export interface ValidatedConsumable {
  definition: ItemDefinition;
  useEffect: ItemUseEffect;
  containerId: string;
  slotKey: string;
}

export type ValidateConsumableResult =
  | { ok: true; consumable: ValidatedConsumable }
  | { ok: false; reason: ConsumableLocationFailure };

/**
 * Read-only: resolves a uniquely-placed backpack consumable and its authored effect.
 *
 * Uniqueness is required, not incidental: consumption deletes the registry entry, so a second
 * container reference would be left dangling. A duplicate is rejected instead of half-repaired.
 */
export function validateBackpackConsumable(
  instanceId: string,
  inventory: InventoryState,
  catalog: ItemCatalog,
): ValidateConsumableResult {
  const instance = inventory.instances[instanceId];
  if (!instance) return { ok: false, reason: 'missing_instance' };

  const definition = catalog.definitions[instance.definitionId];
  const metadata = catalog.metadataById[instance.definitionId];
  if (!definition || !metadata) return { ok: false, reason: 'missing_definition' };
  if (metadata.kind !== 'consumable') return { ok: false, reason: 'not_consumable' };
  if (!definition.useEffect) return { ok: false, reason: 'missing_use_effect' };

  // Every reference across every container — a second one makes removal unsafe.
  const references: Array<{ containerId: string; slotKey: string }> = [];
  for (const container of Object.values(inventory.containers)) {
    for (const [slotKey, slotInstanceId] of Object.entries(container.slots)) {
      if (slotInstanceId === instanceId) references.push({ containerId: container.id, slotKey });
    }
  }
  if (references.length === 0) return { ok: false, reason: 'not_in_backpack' };
  if (references.length > 1) return { ok: false, reason: 'duplicate_placement' };

  const backpack = requireSharedBackpack(inventory);
  const [reference] = references;
  if (reference.containerId !== backpack.id) return { ok: false, reason: 'not_in_backpack' };

  return {
    ok: true,
    consumable: {
      definition,
      useEffect: definition.useEffect,
      containerId: reference.containerId,
      slotKey: reference.slotKey,
    },
  };
}

export type ConsumeItemResult =
  | { ok: true; nextInventory: InventoryState }
  | { ok: false; reason: ConsumableLocationFailure };

/** Immutable: clears the backpack slot and drops the instance from the registry, together. */
export function consumeBackpackItem(
  instanceId: string,
  inventory: InventoryState,
  catalog: ItemCatalog,
): ConsumeItemResult {
  const validation = validateBackpackConsumable(instanceId, inventory, catalog);
  if (!validation.ok) return validation;

  const { containerId, slotKey } = validation.consumable;
  const nextContainers = applySlotChanges(inventory.containers, [
    { containerId, slotKey, instanceId: null },
  ]);
  const nextInstances = { ...inventory.instances };
  delete nextInstances[instanceId];

  return { ok: true, nextInventory: { instances: nextInstances, containers: nextContainers } };
}
