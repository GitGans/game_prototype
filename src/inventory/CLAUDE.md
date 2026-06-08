# inventory

## Role
Pure inventory & equipment domain. All item-container, equip/unequip, equipment-bonus, item-use, snapshot, and
pricing rules. No rendering, no Phaser, no GameState access, no progression resolution.

## Responsibilities
- Low-level item container placement and movement (`containerOps.ts`)
- Equip / unequip / equipped-item queries with class restrictions (`equipmentOps.ts`)
- Stat-bonus aggregation from equipped items (`equipmentBonuses.ts`)
- Item consumption and item-use effect projection (`itemUse.ts`)
- Inventory/equipment read-model snapshots for UI/setup (`inventorySnapshots.ts`)
- Item economy helpers (`pricing.ts`)

## Key Files
- [inventoryConstants.ts](inventoryConstants.ts) — `BACKPACK_SLOT_COUNT = 24` (single capacity invariant)
- [containerOps.ts](containerOps.ts) — `canPlaceItem`, `findFreeBackpackSlot`, `findItemLocation`, `moveItem`, plus the immutable `applySlotChanges` primitive
- [equipmentOps.ts](equipmentOps.ts) — `canUnitEquipItem`, `getEquippedItems`, `equipItem`, `unequipItem`
- [equipmentBonuses.ts](equipmentBonuses.ts) — `getEquippedBonuses`
- [itemUse.ts](itemUse.ts) — `useItem` (returns the effect for core to apply; never applies it)
- [inventorySnapshots.ts](inventorySnapshots.ts) — `buildBackpackSnapshot`, `buildEquipmentSnapshot`, `snapshotActivatableAbilities`
- [pricing.ts](pricing.ts) — `getSellPrice`
- [index.ts](index.ts) — public API barrel

## Structural Role
`src/inventory` → pure domain; consumed by `src/core` orchestration. `battle/` does NOT import inventory.

## Dependencies
- **may import:** `src/shared/`, `src/data/`, and local `src/inventory/` modules
- **must NOT import:** `src/battle/`, `src/core/`, `src/progression/`, `src/world/`, `src/objects/`, `src/scenes/`, `src/ui/`
- import item/stat types directly from `shared/itemTypes`, `shared/unitTypes`, `shared/snapshotTypes` — never from `battle/types`
- Enforced by `scripts/check-boundaries.mjs` (`inventory/**` rule).

## Invariants
- **Purity:** every operation returns new records (result objects); inputs are never mutated. The immutable
  primitive is `applySlotChanges` — it clones the top-level record, each touched container, and each touched
  `slots` object exactly once.
- **No GameState:** inventory never reads or writes `GameState`/`DebugBattleState`. Callers pass the records in
  and assign the returned `nextContainers` / `nextInstances` back themselves.
- **No progression:** equipment rules that need the current class take a resolved `classId` argument; `core`
  resolves it (via `resolveUnitProgression`) and passes it in.
- **Effects out, not applied:** `useItem` removes the consumed item and returns `effect` (`permanent_stat_boost`
  / `heal`). `core` applies the effect (campaign vs debug state). Inventory never mutates permanent bonuses or
  applies heal.
- **Backpack capacity is 24** everywhere — operations and snapshots both use `BACKPACK_SLOT_COUNT`. Do not
  reintroduce a hardcoded `10` or `24`.
- Equipment container id is `equip_${unitTemplateId}`; default backpack id is `backpack_shared`
  (`backpack_debug` for debug). Ring items prefer first free `ring_1`/`ring_2`, else swap `ring_1`.

## Where to Modify
- container placement / movement rules → [containerOps.ts](containerOps.ts)
- equip / unequip / class restrictions → [equipmentOps.ts](equipmentOps.ts)
- equipment stat-bonus aggregation → [equipmentBonuses.ts](equipmentBonuses.ts)
- item consumption / item-use effects → [itemUse.ts](itemUse.ts)
- inventory/equipment snapshots → [inventorySnapshots.ts](inventorySnapshots.ts)
- sell price / item economy → [pricing.ts](pricing.ts)
- backpack capacity → [inventoryConstants.ts](inventoryConstants.ts)
