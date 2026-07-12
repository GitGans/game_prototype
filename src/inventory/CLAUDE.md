# inventory

## Role
Pure inventory & equipment domain. All item-container, equip/unequip, equipment-bonus, snapshot, and
pricing rules. No rendering, no Phaser, no GameState access, no progression resolution. There is no
runtime item-use path in this stage — `useEffect` is catalog data only and is never applied here.

## Responsibilities
- Low-level item container placement and movement (`containerOps.ts`)
- Equip / unequip / equipped-item queries with class restrictions (`equipmentOps.ts`)
- Stat-bonus aggregation from equipped items (`equipmentBonuses.ts`)
- Inventory/equipment read-model snapshots for UI/setup (`inventorySnapshots.ts`)
- Item economy helpers (`pricing.ts`)

## Key Files
- [inventoryConstants.ts](inventoryConstants.ts) — `BACKPACK_SLOT_COUNT = 24` (single capacity invariant)
- [containerOps.ts](containerOps.ts) — `canPlaceItem`, `findFreeBackpackSlot`, `findItemLocation`, `moveItem`, plus the immutable `applySlotChanges` primitive
- [equipmentOps.ts](equipmentOps.ts) — `canUnitEquipItem`, `getEquippedItems`, `equipItem`, `unequipItem`
- [equipmentBonuses.ts](equipmentBonuses.ts) — `getEquippedBonuses`
- [equipmentSlotResolver.ts](equipmentSlotResolver.ts) — `canMetadataUseEquipmentSlot`, `resolvePreferredEquipSlot` (own the `ring` → `ring_1`/`ring_2` rule; `usable` items resolve to `usable_slot`; metadata-driven)
- [inventorySnapshots.ts](inventorySnapshots.ts) — `buildBackpackSnapshot`, `buildEquipmentSnapshot`
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
- **No item-use mechanics this stage:** there is no `useItem` / consume / apply path. `useEffect` on
  `usable` and `consumable` definitions is catalog data only — it is never read or applied at runtime, and
  no item is removed from a container through "use". Mechanics will be added later.
- **Backpack capacity is 24** everywhere — operations and snapshots both use `BACKPACK_SLOT_COUNT`. Do not
  reintroduce a hardcoded `10` or `24`.
- **Every `InventoryState` has exactly one structurally identified shared backpack** —
  `container.kind === 'backpack' && container.ownerTemplateId === undefined`. `requireSharedBackpack`
  enforces this. The container's technical `id` (`backpack_shared` for campaign, `backpack_debug`
  for debug) does **not** determine this — it is a stable record key only. No new domain rule may
  branch on these ID strings; direct ID lookups remain only as a temporary Stage 1 orchestration
  bridge in `core/PhaseManager.ts` (removed once Stage 2 routes equipment through
  `requireSharedBackpack`).
- Equipment container id is `equip_${unitTemplateId}`. Ring items prefer first free `ring_1`/`ring_2`,
  else swap `ring_1`.

## Where to Modify
- container placement / movement rules → [containerOps.ts](containerOps.ts)
- equip / unequip / class restrictions → [equipmentOps.ts](equipmentOps.ts)
- equipment stat-bonus aggregation → [equipmentBonuses.ts](equipmentBonuses.ts)
- inventory/equipment snapshots → [inventorySnapshots.ts](inventorySnapshots.ts)
- sell price / item economy → [pricing.ts](pricing.ts)
- backpack capacity → [inventoryConstants.ts](inventoryConstants.ts)
