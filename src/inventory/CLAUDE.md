# inventory

## Role

Pure inventory & equipment domain. All item-container, equip/unequip, equipment-bonus, item
resolution/removal, snapshot, and pricing rules. No rendering, no Phaser, no GameState access, no
progression resolution. This domain resolves and DESTROYS an item; what its effect DOES is
progression's or battle's business, and composing them is `core`'s.

## Responsibilities

- Low-level item container placement and movement (`containerOps.ts`)
- Equip / unequip / equipped-item queries with class restrictions (`equipmentOps.ts`)
- Stat-bonus aggregation from equipped items (`equipmentBonuses.ts`)
- Item resolution and destruction for use (`itemUseOps.ts`)
- Inventory/equipment read-model snapshots for UI/setup (`inventorySnapshots.ts`)
- Item economy helpers (`pricing.ts`)

## Key Files

- [inventoryConstants.ts](inventoryConstants.ts) — `BACKPACK_SLOT_COUNT = 24` (single capacity invariant)
- [containerOps.ts](containerOps.ts) — `canPlaceItem`, `findFreeBackpackSlot`, `findItemLocation`, `moveItem`, plus the immutable `applySlotChanges` primitive
- [equipmentOps.ts](equipmentOps.ts) — `canUnitEquipItem`, `getEquippedItems`, `evaluateEquipItem`, `equipItem`, `unequipItem`. **`evaluateEquipItem` is the read half of `equipItem` and enforces every one of its preconditions** — slot resolution, equipment container, source location and swap feasibility against the vacated containers — because `canUnitEquipItem` checks only instance/definition existence and class restriction and is _not_ a sufficient "can this be equipped" predicate. `equipItem` is implemented on top of it, so a screen's enabled state and the pipeline's outcome are one decision and cannot drift (`equipItem`/`unequipItem` take and return `InventoryState`; `unequipItem` takes a `ConcreteEquipSlot` and resolves its destination backpack via `requireSharedBackpack`, no `backpackId` parameter)
- [itemUseOps.ts](itemUseOps.ts) — `validateItemForUse` (read-only), `removeItemInstances` (immutable batch removal via `applySlotChanges`) and the single-request wrapper `consumeBackpackItem`. Validation takes an explicit **expected location** (`ItemUseLocation`): `shared_backpack` accepts `consumable` and `usable`, `equipped_usable` accepts a `usable` whose metadata places it in `usable_slot` and that is actually in `equip_${unitTemplateId}` there. The equipped variant carries **no caller-chosen slot** — letting a caller name the slot would let a misplaced item authorize its own consumption. Every request requires the instance to have **exactly one** container reference: removal deletes the registry entry, so a second reference would be left dangling — `duplicate_placement` is rejected rather than half-repaired. `removeItemInstances` validates the **whole batch** against the original inventory before constructing a result, and rejects a repeated instance id explicitly (validating it twice would otherwise succeed twice)
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
- **Item use is split across layers, and this one owns only the item half.**
  `itemUseOps.ts` resolves and removes; it never applies an effect and never sees a roster.
  Applying a `permanent_stat_boost` is `progression/consumableStatBoost.ts` and applying a `heal`
  out of combat is `progression/itemHealing.ts`; composing them with the item half is
  `core/itemUse.ts`. In battle, `battle/itemUse.ts` applies the effect; inventory participates again only when a
  completed attempt is settled through `core/battleItemSettlement.ts`. Abandoned and replayed
  attempts do not mutate persistent inventory. `useEffect` reaches this
  domain as opaque data it forwards to the caller: **kind and placement decide here, never the
  effect type**.
- **`usable` items are activatable, from two places.** A `usable` in the shared backpack is
  drinkable exactly like a `consumable` (`shared_backpack`); the same item in `usable_slot` is
  activatable during a manual battle turn (`equipped_usable`). A resurrection scroll is activatable
  from `usable_slot` in battle but not from the backpack yet — both decisions belong to the layers
  that own effect support, never here.
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

- item resolution / removal for use → [itemUseOps.ts](itemUseOps.ts)
- container placement / movement rules → [containerOps.ts](containerOps.ts)
- equip / unequip / class restrictions → [equipmentOps.ts](equipmentOps.ts)
- equipment stat-bonus aggregation → [equipmentBonuses.ts](equipmentBonuses.ts)
- inventory/equipment snapshots → [inventorySnapshots.ts](inventorySnapshots.ts)
- sell price / item economy → [pricing.ts](pricing.ts)
- backpack capacity → [inventoryConstants.ts](inventoryConstants.ts)
