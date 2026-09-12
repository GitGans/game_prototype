import type {
  ItemLocationFailure, ItemCatalog, ItemDefinition, ItemUseEffect,
} from '../shared/itemTypes';
import type { InventoryState } from './inventoryState';
import { requireSharedBackpack } from './inventoryState';
import { applySlotChanges } from './containerOps';

/**
 * Item resolution and destruction for use. Pure: inputs are never mutated, the catalog is passed
 * in, and the shared backpack is identified structurally (`requireSharedBackpack`) — never by
 * container id.
 *
 * This module knows nothing about what an effect DOES. It resolves the item, proves it is safely
 * removable from the location the caller expects, and removes it; applying the effect belongs to
 * progression (out of combat) or battle (in combat).
 */

/** The equipment slot a `usable` item is activated from. There is no other. */
const USABLE_SLOT = 'usable_slot';

/**
 * Where the caller expects the instance to be. Passing it explicitly is what keeps this module
 * free of the question "why is this item being used" — kind and placement decide here, never the
 * effect type.
 *
 * The equipped variant carries NO caller-chosen slot. A usable item is only ever activated from
 * `usable_slot`; letting a caller name the slot would let a misplaced item authorize its own
 * consumption.
 */
export type ItemUseLocation =
  | { readonly kind: 'shared_backpack' }
  | { readonly kind: 'equipped_usable'; readonly unitTemplateId: string };

export interface ValidatedItem {
  definition: ItemDefinition;
  useEffect: ItemUseEffect;
  containerId: string;
  slotKey: string;
}

export type ValidateItemResult =
  | { ok: true; item: ValidatedItem }
  | { ok: false; reason: ItemLocationFailure };

/** Every reference across every container — a second one makes removal unsafe. */
function findReferences(
  instanceId: string,
  inventory: InventoryState,
): Array<{ containerId: string; slotKey: string }> {
  const references: Array<{ containerId: string; slotKey: string }> = [];
  for (const container of Object.values(inventory.containers)) {
    for (const [slotKey, slotInstanceId] of Object.entries(container.slots)) {
      if (slotInstanceId === instanceId) references.push({ containerId: container.id, slotKey });
    }
  }
  return references;
}

/**
 * Read-only: resolves a uniquely-placed item and its authored effect, against the location the
 * caller expects to find it in.
 *
 * Uniqueness is required, not incidental: consumption deletes the registry entry, so a second
 * container reference would be left dangling. A duplicate is rejected instead of half-repaired.
 */
export function validateItemForUse(input: {
  instanceId: string;
  inventory: InventoryState;
  catalog: ItemCatalog;
  expected: ItemUseLocation;
}): ValidateItemResult {
  const { instanceId, inventory, catalog, expected } = input;

  const instance = inventory.instances[instanceId];
  if (!instance) return { ok: false, reason: 'missing_instance' };

  const definition = catalog.definitions[instance.definitionId];
  const metadata = catalog.metadataById[instance.definitionId];
  if (!definition || !metadata) return { ok: false, reason: 'missing_definition' };

  // Kind is checked against the EXPECTED location, not in the abstract: a consumable is usable
  // from the backpack and nowhere else, a usable from either place.
  if (expected.kind === 'shared_backpack') {
    if (metadata.kind !== 'consumable' && metadata.kind !== 'usable') {
      return { ok: false, reason: 'not_usable_from_here' };
    }
  } else if (metadata.kind !== 'usable' || metadata.slot !== USABLE_SLOT) {
    // Metadata compatibility, not a caller assertion. An item whose group does not place it in
    // usable_slot can never be activated from an equipment container, however it got there.
    return { ok: false, reason: 'not_usable_from_here' };
  }

  if (!definition.useEffect) return { ok: false, reason: 'missing_use_effect' };

  const misplaced: ItemLocationFailure =
    expected.kind === 'shared_backpack' ? 'not_in_backpack' : 'not_equipped_by_unit';

  const references = findReferences(instanceId, inventory);
  if (references.length === 0) return { ok: false, reason: misplaced };
  if (references.length > 1) return { ok: false, reason: 'duplicate_placement' };
  const [reference] = references;

  if (expected.kind === 'shared_backpack') {
    const backpack = requireSharedBackpack(inventory);
    if (reference.containerId !== backpack.id) return { ok: false, reason: misplaced };
  } else {
    const expectedContainerId = `equip_${expected.unitTemplateId}`;
    if (reference.containerId !== expectedContainerId) return { ok: false, reason: misplaced };
    if (reference.slotKey !== USABLE_SLOT) return { ok: false, reason: misplaced };
  }

  return {
    ok: true,
    item: {
      definition,
      useEffect: definition.useEffect,
      containerId: reference.containerId,
      slotKey: reference.slotKey,
    },
  };
}

export interface RemoveItemRequest {
  readonly instanceId: string;
  readonly expected: ItemUseLocation;
}

export type RemoveItemsResult =
  | { ok: true; nextInventory: InventoryState }
  | { ok: false; reason: ItemLocationFailure; instanceId: string };

/**
 * Immutable batch removal: clears each slot and drops each instance from the registry, together.
 *
 * The ENTIRE batch is validated before any result is constructed, so a batch that fails leaves
 * the caller with the untouched input rather than a partially settled inventory. Validation runs
 * against the ORIGINAL inventory for every request, which is why a duplicate instance id in the
 * batch is rejected explicitly — validating it twice would otherwise succeed twice and delete a
 * registry entry that a later removal still expects.
 */
export function removeItemInstances(input: {
  requests: readonly RemoveItemRequest[];
  inventory: InventoryState;
  catalog: ItemCatalog;
}): RemoveItemsResult {
  const { requests, inventory, catalog } = input;

  const seen = new Set<string>();
  const changes: Array<{ containerId: string; slotKey: string; instanceId: null }> = [];

  for (const request of requests) {
    if (seen.has(request.instanceId)) {
      return { ok: false, reason: 'duplicate_placement', instanceId: request.instanceId };
    }
    seen.add(request.instanceId);

    const validation = validateItemForUse({
      instanceId: request.instanceId,
      inventory,
      catalog,
      expected: request.expected,
    });
    if (!validation.ok) {
      return { ok: false, reason: validation.reason, instanceId: request.instanceId };
    }
    const { containerId, slotKey } = validation.item;
    changes.push({ containerId, slotKey, instanceId: null });
  }

  const nextContainers = applySlotChanges(inventory.containers, changes);
  const nextInstances = { ...inventory.instances };
  for (const instanceId of seen) delete nextInstances[instanceId];

  return { ok: true, nextInventory: { instances: nextInstances, containers: nextContainers } };
}

export type ConsumeItemResult =
  | { ok: true; nextInventory: InventoryState }
  | { ok: false; reason: ItemLocationFailure };

/** Single-request wrapper over `removeItemInstances` for the backpack use path. */
export function consumeBackpackItem(
  instanceId: string,
  inventory: InventoryState,
  catalog: ItemCatalog,
): ConsumeItemResult {
  const result = removeItemInstances({
    requests: [{ instanceId, expected: { kind: 'shared_backpack' } }],
    inventory,
    catalog,
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, nextInventory: result.nextInventory };
}
