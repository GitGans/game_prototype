import type { ItemContainer, ItemInstance, ItemDefinition } from '../shared/itemTypes';
import { BACKPACK_SLOT_COUNT } from './inventoryConstants';

// ─── Immutable slot primitive ─────────────────────────────────────────────────
export type SlotChange = { containerId: string; slotKey: string; instanceId: string | null };

/**
 * Applies slot writes/clears immutably. Clones the top-level record, each touched
 * container, and each touched `slots` object exactly once. Inputs are never mutated.
 * `instanceId: null` clears the slot; a string sets it.
 */
export function applySlotChanges(
  containers: Record<string, ItemContainer>,
  changes: SlotChange[],
): Record<string, ItemContainer> {
  const next = { ...containers };
  const cloned = new Set<string>();
  for (const { containerId } of changes) {
    if (next[containerId] && !cloned.has(containerId)) {
      next[containerId] = { ...next[containerId], slots: { ...next[containerId].slots } };
      cloned.add(containerId);
    }
  }
  for (const { containerId, slotKey, instanceId } of changes) {
    if (!next[containerId]) continue;
    if (instanceId === null) delete next[containerId].slots[slotKey];
    else next[containerId].slots[slotKey] = instanceId;
  }
  return next;
}

// ─── Queries ──────────────────────────────────────────────────────────────────
/**
 * Returns true if item can be placed into container at slotKey.
 * - backpack: slotKey must be '0'..'23' and the slot must be empty.
 * - equipment: slotKey must match the item's equipSlot and the slot must be empty.
 */
export function canPlaceItem(
  instanceId: string,
  container: ItemContainer,
  slotKey: string,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
): boolean {
  if (container.slots[slotKey] !== undefined) return false; // slot occupied

  const instance = instances[instanceId];
  if (!instance) return false;
  const definition = definitions[instance.definitionId];
  if (!definition) return false;

  if (container.kind === 'backpack') {
    const idx = parseInt(slotKey, 10);
    return Number.isInteger(idx) && idx >= 0 && idx < BACKPACK_SLOT_COUNT;
  }
  if (container.kind === 'equipment') {
    if (definition.equipSlot === 'ring') return slotKey === 'ring_1' || slotKey === 'ring_2';
    return definition.equipSlot === slotKey;
  }
  return false;
}

/** Returns the first free slot key in a backpack ('0'..'23'), or null if full. */
export function findFreeBackpackSlot(container: ItemContainer): string | null {
  for (let i = 0; i < BACKPACK_SLOT_COUNT; i++) {
    if (container.slots[String(i)] === undefined) return String(i);
  }
  return null;
}

/**
 * Finds which container and slot currently holds the given item instance.
 * Returns null if the item is not in any container.
 */
export function findItemLocation(
  instanceId: string,
  containers: Record<string, ItemContainer>,
): { containerId: string; slotKey: string } | null {
  for (const container of Object.values(containers)) {
    for (const [slotKey, id] of Object.entries(container.slots)) {
      if (id === instanceId) return { containerId: container.id, slotKey };
    }
  }
  return null;
}

// ─── Mutation (pure) ────────────────────────────────────────────────────────────
export type MoveItemResult =
  | { ok: true; nextContainers: Record<string, ItemContainer> }
  | { ok: false; reason: 'missing_from_container' | 'missing_to_container' | 'source_mismatch' | 'invalid_target' };

/**
 * Moves an item from one container+slot to another. Validates first; on failure
 * returns a reason and leaves inputs untouched. On success returns new containers.
 */
export function moveItem(
  instanceId: string,
  fromContainerId: string,
  fromSlot: string,
  toContainerId: string,
  toSlot: string,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
): MoveItemResult {
  const from = containers[fromContainerId];
  if (!from) return { ok: false, reason: 'missing_from_container' };
  const to = containers[toContainerId];
  if (!to) return { ok: false, reason: 'missing_to_container' };
  if (from.slots[fromSlot] !== instanceId) return { ok: false, reason: 'source_mismatch' };
  if (!canPlaceItem(instanceId, to, toSlot, instances, definitions)) return { ok: false, reason: 'invalid_target' };

  const nextContainers = applySlotChanges(containers, [
    { containerId: fromContainerId, slotKey: fromSlot, instanceId: null },
    { containerId: toContainerId,   slotKey: toSlot,   instanceId },
  ]);
  return { ok: true, nextContainers };
}
