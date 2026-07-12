import type { ItemInstance, ItemContainer } from '../shared/itemTypes';

export interface InventoryState {
  instances: Record<string, ItemInstance>;
  containers: Record<string, ItemContainer>;
}

/**
 * Structural shared-backpack invariant: exactly one backpack with no ownerTemplateId.
 * Container IDs are technical keys and do NOT determine this.
 */
export function requireSharedBackpack(inventory: InventoryState): ItemContainer {
  const matches = Object.values(inventory.containers).filter(
    c => c.kind === 'backpack' && c.ownerTemplateId === undefined,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Inventory must contain exactly one shared backpack; found ${matches.length}`,
    );
  }
  return matches[0];
}
