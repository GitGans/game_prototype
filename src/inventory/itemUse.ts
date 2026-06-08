import type { ItemContainer, ItemInstance, ItemDefinition, ItemUseEffect } from '../shared/itemTypes';
import { findItemLocation, applySlotChanges } from './containerOps';

export type UseItemResult =
  | {
      ok: true;
      nextContainers: Record<string, ItemContainer>;
      nextInstances: Record<string, ItemInstance>;
      effect: ItemUseEffect;
    }
  | { ok: false; reason: 'missing_instance' | 'missing_definition' | 'missing_use_effect' };

/**
 * Consume an item: remove it from its container slot and delete the instance.
 * Returns the item's `useEffect` for CORE to apply. Inventory never applies effects
 * (no permanent-bonus mutation, no heal) and never touches GameState. Pure.
 */
export function useItem(
  instanceId: string,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
): UseItemResult {
  const instance = instances[instanceId];
  if (!instance) return { ok: false, reason: 'missing_instance' };
  const def = definitions[instance.definitionId];
  if (!def) return { ok: false, reason: 'missing_definition' };
  if (!def.useEffect) return { ok: false, reason: 'missing_use_effect' };

  const location = findItemLocation(instanceId, containers);
  const nextContainers = location
    ? applySlotChanges(containers, [{ containerId: location.containerId, slotKey: location.slotKey, instanceId: null }])
    : containers;

  const nextInstances = { ...instances };
  delete nextInstances[instanceId];

  return { ok: true, nextContainers, nextInstances, effect: def.useEffect };
}
