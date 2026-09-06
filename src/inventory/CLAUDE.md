# inventory

## Role
Pure inventory & equipment domain. All item-container, equip/unequip, equipment-bonus, consumable
resolution/removal, snapshot, and pricing rules. No rendering, no Phaser, no GameState access, no
progression resolution. This domain resolves and DESTROYS a consumable; what its effect DOES is
progression's business, and composing the two is `core`'s.

## Responsibilities
- Low-level item container placement and movement (`containerOps.ts`)
- Equip / unequip / equipped-item queries with class restrictions (`equipmentOps.ts`)
- Stat-bonus aggregation from equipped items (`equipmentBonuses.ts`)
- Consumable resolution and destruction (`consumableOps.ts`)
- Inventory/equipment read-model snapshots for UI/setup (`inventorySnapshots.ts`)
- Item economy helpers (`pricing.ts`)

## Key Files
- [inventoryConstants.ts](inventoryConstants.ts) — `BACKPACK_SLOT_COUNT = 24` (single capacity invariant)
- [containerOps.ts](containerOps.ts) — `canPlaceItem`, `findFreeBackpackSlot`, `findItemLocation`, `moveItem`, plus the immutable `applySlotChanges` primitive
- [equipmentOps.ts](equipmentOps.ts) — `canUnitEquipItem`, `getEquippedItems`, `equipItem`, `unequipItem` (`equipItem`/`unequipItem` take and return `InventoryState`; `unequipItem` takes a `ConcreteEquipSlot` and resolves its destination backpack via `requireSharedBackpack`, no `backpackId` parameter)
- [consumableOps.ts](consumableOps.ts) — `validateBackpackConsumable` (read-only: resolves a consumable and its authored `useEffect`), `consumeBackpackItem` (immutable removal via `applySlotChanges`). Both require the instance to have **exactly one** container reference, in the structurally identified shared backpack: consumption deletes the registry entry, so a second reference would be left dangling — `duplicate_placement` is rejected rather than half-repaired
- [equipmentBonuses.ts](equipmentBonuses.ts) — `getEquippedBonuses`
- [equipmentSlotResolver.ts](equipmentSlotResolver.ts) — `canMetadataUseEquipmentSlot`, `resolvePreferredEquipSlot` (own the `ring` → `ring_1`/`ring_2` rule; `usable` items resolve to `usable_slot`; metadata-driven), `isConcreteEquipSlot` (application-boundary guard rejecting the item-level pseudo-slot `'ring'` and unknown strings)
- [inventorySnapshots.ts](inventorySnapshots.ts) — `buildBackpackSnapshot`, `buildEquipmentSnapshot` (both take `InventoryState`; `buildBackpackSnapshot` resolves its backpack via `requireSharedBackpack`, no container-id parameter)
- [pricing.ts](pricing.ts) — `getSellPrice`
- [inventoryState.ts](inventoryState.ts) — `InventoryState { instances, containers }`; `requireSharedBackpack` (structural shared-backpack invariant)
- [index.ts](index.ts) — public API barrel

## Structural Role
`src/inventory` → pure domain; consumed by `src/core` orchestration. `battle/` does NOT import inventory.

## Dependencies
- **may import:** `src/shared/`, `src/data/`, and local `src/inventory/` modules
- **must NOT import:** `src/battle/`, `src/core/`, `src/progression/`, `src/world/`, `src/objects/`, `src/scenes/`, `src/ui/`
- import item/stat types directly from `shared/itemTypes`, `shared/unitTypes`, `shared/snapshotTypes` — never from `battle/types`
- Enforced by `scripts/check-boundaries.mjs` (`inventory/**` rule).

## Invariants
- **Catalog in, never imported:** functions that need behavior/slot metadata take an `ItemCatalog`
  (`{ definitions, metadataById }`) as a parameter; `core` passes `ITEM_CATALOG` in. Pure fact readers
  (`getEquippedBonuses`, `canUnitEquipItem`) still take a plain `definitions` map. Slot/behavior decisions
  come from `metadata` (`metadata.slot` for placement, `metadata.kind` for behavior) — never from fields on
  `ItemDefinition`. Equip eligibility is owned here via `metadata`, not by UI routing.
- **Purity:** every operation returns new records (result objects); inputs are never mutated. The immutable
  primitive is `applySlotChanges` — it clones the top-level record, each touched container, and each touched
  `slots` object exactly once.
- **No GameState:** inventory never reads or writes `GameState`/`DebugBattleState`. Callers pass the records in
  and assign the returned `nextContainers` / `nextInstances` back themselves.
- **No progression:** equipment rules that need the current class take a resolved `classId` argument; `core`
  resolves it (via `resolveUnitProgression`) and passes it in.
- **Consumable use is split across three layers, and this one owns only the item half.**
  `consumableOps.ts` resolves and removes; it never applies an effect and never sees a roster.
  Applying a `permanent_stat_boost` is `progression/consumableStatBoost.ts`; composing the two is
  `core/consumableUse.ts`. `useEffect` reaches this domain as opaque data it forwards to the caller.
- **`heal`, `revive` and `usable` activation remain unimplemented.** Only `permanent_stat_boost` has
  runtime mechanics; the other effects stay catalog data, and the use operation rejects them with
  `unsupported_effect`.
- **Backpack capacity is 24** everywhere — operations and snapshots both use `BACKPACK_SLOT_COUNT`. Do not
  reintroduce a hardcoded `10` or `24`.
- **Every `InventoryState` has exactly one structurally identified shared backpack** —
  `container.kind === 'backpack' && container.ownerTemplateId === undefined`. `requireSharedBackpack`
  enforces this. The container's technical `id` (`backpack_shared` for campaign, `backpack_debug`
  for debug) does **not** determine this — it is a stable record key only. No domain rule may
  branch on these ID strings. As of Stage 2, `equipItem`/`unequipItem`/`buildBackpackSnapshot`
  resolve the shared backpack structurally via `requireSharedBackpack`, and `core/PhaseManager.ts`
  no longer performs ID-based lookups for equipment — that temporary bridge has been removed.
- Equipment container id is `equip_${unitTemplateId}`. Ring items prefer first free `ring_1`/`ring_2`,
  else swap `ring_1`.

## Where to Modify
- consumable resolution / removal → [consumableOps.ts](consumableOps.ts)
- container placement / movement rules → [containerOps.ts](containerOps.ts)
- equip / unequip / class restrictions → [equipmentOps.ts](equipmentOps.ts)
- equipment stat-bonus aggregation → [equipmentBonuses.ts](equipmentBonuses.ts)
- inventory/equipment snapshots → [inventorySnapshots.ts](inventorySnapshots.ts)
- sell price / item economy → [pricing.ts](pricing.ts)
- backpack capacity → [inventoryConstants.ts](inventoryConstants.ts)
