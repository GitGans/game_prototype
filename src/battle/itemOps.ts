import {
  EquipSlot, ItemContainer, ItemDefinition, ItemInstance,
  BattleStatBonuses, UnitClassId,
  BackpackSnapshot, EquipmentSnapshot, ItemSlotSnapshot,
  UnitActivatableAbility,
} from './types';

// ─── Low-level ────────────────────────────────────────────────────────────────

/**
 * Returns true if item can be placed into container at slotKey.
 * - backpack: slotKey must be '0'–'23' and the slot must be empty.
 * - equipment: slotKey must match the item's equipSlot and the slot must be empty.
 */
export function canPlace(
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
    return Number.isInteger(idx) && idx >= 0 && idx < 10;
  }

  if (container.kind === 'equipment') {
    if (definition.equipSlot === 'ring') {
      return slotKey === 'ring_1' || slotKey === 'ring_2';
    }
    return definition.equipSlot === slotKey;
  }

  return false;
}

/**
 * Returns true if the unit class is allowed to equip this item.
 * If the item has no allowedClassIds (or empty array), all classes are allowed.
 */
export function canUnitEquipItem(
  classId: UnitClassId,
  instanceId: string,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
): boolean {
  const instance = instances[instanceId];
  if (!instance) return false;
  const definition = definitions[instance.definitionId];
  if (!definition) return false;
  if (!definition.allowedClassIds || definition.allowedClassIds.length === 0) return true;
  return definition.allowedClassIds.includes(classId);
}

/**
 * Returns the first free slot key in a backpack ('0'–'23'), or null if full.
 */
export function findFreeBackpackSlot(container: ItemContainer): string | null {
  for (let i = 0; i < 10; i++) {
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

/**
 * Atomically moves an item from one container+slot to another.
 * Validates first — if invalid, returns false without mutating anything.
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
): boolean {
  const from = containers[fromContainerId];
  const to   = containers[toContainerId];
  if (!from || !to) return false;
  if (from.slots[fromSlot] !== instanceId) return false;
  if (!canPlace(instanceId, to, toSlot, instances, definitions)) return false;

  delete from.slots[fromSlot];
  to.slots[toSlot] = instanceId;
  return true;
}

// ─── High-level ───────────────────────────────────────────────────────────────

/**
 * Equips a backpack item onto the unit's equipment slot.
 *
 * - If the target equipment slot is empty → simple move (backpack → equipment).
 * - If the target equipment slot is occupied → SWAP:
 *     equipped item moves to the backpack slot that the new item came from,
 *     new item moves to the equipment slot.
 *
 * Returns false if:
 * - instance not found in any container
 * - item has no equipSlot (not equippable)
 * - equipment container not found
 * - swap is somehow invalid
 */
export function equipItem(
  unitTemplateId: string,
  classId: UnitClassId,
  instanceId: string,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
): boolean {
  const instance = instances[instanceId];
  if (!instance) return false;

  const definition = definitions[instance.definitionId];
  if (!definition || !definition.equipSlot) return false;

  // Class restriction check
  if (!canUnitEquipItem(classId, instanceId, instances, definitions)) return false;

  // Rings can equip into ring_1 or ring_2; pick first free, else swap ring_1.
  const equipContainerForRingCheck = containers[`equip_${unitTemplateId}`];
  const slot: EquipSlot = definition.equipSlot === 'ring'
    ? ((['ring_1', 'ring_2'] as EquipSlot[]).find(
        s => equipContainerForRingCheck?.slots[s] === undefined
      ) ?? 'ring_1')
    : definition.equipSlot;
  const equipContainerId = `equip_${unitTemplateId}`;
  const equipContainer = containers[equipContainerId];
  if (!equipContainer) return false;

  const location = findItemLocation(instanceId, containers);
  if (!location) return false;

  const currentlyEquipped = equipContainer.slots[slot];

  if (currentlyEquipped === undefined) {
    // Simple equip: move from current location to equipment slot
    return moveItem(
      instanceId,
      location.containerId, location.slotKey,
      equipContainerId, slot,
      containers, instances, definitions,
    );
  } else {
    // SWAP: move equipped item to the backpack slot the new item came from,
    //       then move new item to the equipment slot.
    const backpackContainerId = location.containerId;
    const backpackSlot        = location.slotKey;

    const equippedInstance = instances[currentlyEquipped];
    if (!equippedInstance) return false;

    // Temporarily remove both items to allow placement checks
    delete equipContainer.slots[slot];
    delete containers[backpackContainerId].slots[backpackSlot];

    const canPutOldInBackpack = canPlace(
      currentlyEquipped,
      containers[backpackContainerId],
      backpackSlot,
      instances,
      definitions,
    );
    const canPutNewInEquip = canPlace(
      instanceId,
      equipContainer,
      slot,
      instances,
      definitions,
    );

    if (!canPutOldInBackpack || !canPutNewInEquip) {
      // Restore original state
      equipContainer.slots[slot] = currentlyEquipped;
      containers[backpackContainerId].slots[backpackSlot] = instanceId;
      return false;
    }

    // Commit the swap
    containers[backpackContainerId].slots[backpackSlot] = currentlyEquipped;
    equipContainer.slots[slot] = instanceId;
    return true;
  }
}

/**
 * Unequips the item in the given slot, moving it to the first free backpack slot.
 * Returns false if backpack is full.
 */
export function unequipItem(
  unitTemplateId: string,
  slot: EquipSlot,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
  backpackId: string = 'backpack_shared',
): boolean {
  const equipContainerId    = `equip_${unitTemplateId}`;
  const backpackContainerId = backpackId;

  const equipContainer    = containers[equipContainerId];
  const backpackContainer = containers[backpackContainerId];
  if (!equipContainer || !backpackContainer) return false;

  const instanceId = equipContainer.slots[slot];
  if (instanceId === undefined) return false; // nothing equipped

  const freeSlot = findFreeBackpackSlot(backpackContainer);
  if (freeSlot === null) return false; // backpack full

  return moveItem(
    instanceId,
    equipContainerId, slot,
    backpackContainerId, freeSlot,
    containers, instances, definitions,
  );
}

/**
 * Returns all equipped ItemInstances for a unit.
 * Returns [] if the equipment container doesn't exist or all slots are empty.
 */
export function getEquippedItems(
  unitTemplateId: string,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
): ItemInstance[] {
  const equipContainer = containers[`equip_${unitTemplateId}`];
  if (!equipContainer) return [];

  return Object.values(equipContainer.slots)
    .map(id => instances[id])
    .filter((inst): inst is ItemInstance => inst !== undefined);
}

export function getEquippedBonuses(
  unitTemplateId: string,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
): BattleStatBonuses {
  const equipped = getEquippedItems(unitTemplateId, containers, instances);
  const bonuses: BattleStatBonuses = {
    hp: 0, physicalStrength: 0, magicalStrength: 0, physicalDefense: 0, magicalDefense: 0,
  };
  for (const inst of equipped) {
    const def = definitions[inst.definitionId];
    if (!def) continue;
    bonuses.hp               += def.battleStatBonuses.hp;
    bonuses.physicalStrength += def.battleStatBonuses.physicalStrength;
    bonuses.magicalStrength  += def.battleStatBonuses.magicalStrength;
    bonuses.physicalDefense += def.battleStatBonuses.physicalDefense;
    bonuses.magicalDefense  += def.battleStatBonuses.magicalDefense;
  }
  return bonuses;
}

export function getSellPrice(def: ItemDefinition): number {
  return Math.floor(def.buyPrice / 4);
}

export function snapshotActivatableAbilities(
  unitTemplateId: string,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
): UnitActivatableAbility[] {
  const equipped = getEquippedItems(unitTemplateId, containers, instances);
  const result: UnitActivatableAbility[] = [];
  for (const inst of equipped) {
    const def = definitions[inst.definitionId];
    if (def?.usage === 'equip_and_activate' && def.useEffect) {
      result.push({
        sourceItemDefinitionId: def.id,
        name: def.name,
        useEffect: def.useEffect,
        usesRemaining: 1,
      });
    }
  }
  return result;
}

export function useItem(
  instanceId: string,
  unitTemplateId: string,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  permanentBonuses: Record<string, Partial<BattleStatBonuses>>,
  definitions: Record<string, ItemDefinition>,
): boolean {
  const instance = instances[instanceId];
  if (!instance) return false;
  const def = definitions[instance.definitionId];
  if (!def?.useEffect) return false;

  if (def.useEffect.type === 'permanent_stat_boost' && def.useEffect.stat) {
    const existing = permanentBonuses[unitTemplateId] ?? {};
    permanentBonuses[unitTemplateId] = {
      ...existing,
      [def.useEffect.stat]: (existing[def.useEffect.stat] ?? 0) + def.useEffect.amount,
    };
  }
  // 'heal' in non-battle context is a no-op for now (requires BattleState access)

  for (const container of Object.values(containers)) {
    for (const [slot, id] of Object.entries(container.slots)) {
      if (id === instanceId) { delete container.slots[slot]; break; }
    }
  }
  delete instances[instanceId];
  return true;
}

export function buildBackpackSnapshot(
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
  containerId = 'backpack_shared',
): BackpackSnapshot {
  const backpack = containers[containerId];
  const slots: Array<ItemSlotSnapshot | null> = Array(24).fill(null);
  if (!backpack) return { slots };

  for (let i = 0; i < 24; i++) {
    const instanceId = backpack.slots[String(i)];
    if (!instanceId) continue;
    const instance = instances[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (instance && definition) slots[i] = { instanceId, definition };
  }
  return { slots };
}

export function buildEquipmentSnapshot(
  unitTemplateId: string,
  containers: Record<string, ItemContainer>,
  instances: Record<string, ItemInstance>,
  definitions: Record<string, ItemDefinition>,
): EquipmentSnapshot {
  const equipContainer = containers[`equip_${unitTemplateId}`];
  if (!equipContainer) return { slots: {} };

  const slots: Partial<Record<string, ItemSlotSnapshot>> = {};
  for (const [slotKey, instanceId] of Object.entries(equipContainer.slots)) {
    const instance = instances[instanceId];
    const definition = instance ? definitions[instance.definitionId] : undefined;
    if (instance && definition) slots[slotKey] = { instanceId, definition };
  }
  return { slots };
}
