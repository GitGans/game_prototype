# shared

## Role
Dependency-free, cross-layer type contract system. Single source of truth for all domain types consumed by every other layer. No imports from `battle/`, `core/`, `data/`, `objects/`, `scenes/`, `ui/`, or `world/` — only intra-shared imports allowed.

## Responsibilities
- Define grid geometry primitives (positions, shapes, sides)
- Define unit blueprints, stats, and progression contracts
- Define skill system types (damage, effects, patterns)
- Define item/equipment types and inventory structure
- Define read-only UI projection snapshots (safe for rendering)
- Define world/map entity types

## Key Files
- `gridTypes.ts` — Grid geometry: `Side`, `Row`, `Col`, `CellCoord`, `UnitShape`
- `unitTypes.ts` — Unit blueprints: `UnitBlueprint`, `UnitBattleStats`, `UnitClass`, `UnitUpgradeTier`
- `skillTypes.ts` — Combat primitive and semantic input types: `Effect`, `SkillPattern`, and semantic refs (`DamageModifierRef`, `PostDamageEffect`, `InstantEffectApplication`, `AppliedEffectMeta`) used by `combat.ts` and `skillUsePlan.ts`. Legacy block-shaped skill interfaces have been removed.
- `skillDefinitionTypes.ts` — Active authoring contract: `ActionSkillDefinition`, action types, target policy types, matrix refs, power source types
- `itemTypes.ts` — Item/equipment: `ItemDefinition` (facts only — no `usage`/`equipSlot`), `ItemRuntimeMetadata` + `ItemRuntimeKind` (`equipment` | `usable` | `consumable`; generated behavior/slot), `ItemCatalog`, `ItemInstance`, `ItemContainer`, `EquipSlot` (usable slot key is `usable_slot`), `ItemUseEffect` (discriminated union; `permanent_stat_boost` and `heal` are EXECUTABLE, `heal` for `usable` and `consumable` alike; `revive` carries an authored `hpPercent` and is executable in battle only — this file declares the contract, while percentage validation lives in the owning domains: `data/items/buildItemCatalog.ts` for authored content and `battle/itemUsability.ts` for runtime input), `BattleItemTargetMode` (`self` | `dead_ally`, carried by the battle action-bar snapshot), `ReadonlyItemUseEffect` (deeply readonly; a plain `readonly effect` field leaves `effect.amount` assignable, so every runtime resource, domain input and snapshot entry uses this instead), plus the failure vocabularies shared across layers: `ItemLocationFailure` / `ItemBoostFailure` / `ItemHealFailure` / `ItemUseFailure` (inventory, progression, core), `BattleItemUseFailure` (including `no_valid_targets`, `item_not_selected`, `invalid_target`) and `ItemEquipFailure`. The last two are declared HERE rather than in `battle/` and `inventory/` because the snapshots carry them and `shared/` may import no other layer, even type-only
- `snapshotTypes.ts` — UI projections: `UnitStatsSnapshot`, `SkillIconSnapshot`, `BackpackSnapshot`, `EquipmentSnapshot`, plus the item-use projections `ItemEffectPreview`, `ItemUsability`, `ItemInteraction` (`choosing_action | confirming_use`; declared here, not in the importer-restricted `core/itemInteractionStorage`, so a projection can NAME it without gaining the ability to write the cell), `PendingItemUsePrompt`, `ItemActionKind`, `ItemActionOptionSnapshot` and `ItemActionMenuSnapshot` (structured data only — never formatted text; wording lives in `objects/itemUseEffectPresentation.ts`). `ItemEffectPreview` is the one effect payload shared by the usability entry and the prompt, so a dialog cannot describe a different effect from the one confirmation executes; its heal variant carries the CLAMPED `restoredHp` and deliberately no `nextHp` (that is `currentHp + restoredHp`, derived in presentation, so a stored copy cannot contradict it)
- `battleSnapshots.ts` — Battle-phase projections: `BattleUnitSnapshot`, `FieldBattleUnitSnapshot`, `BattleOccupancySnapshot` (rebuilt dynamically per phase), plus `BattleActionBarEntry` — the active unit's action bar as a discriminated reference (an ordinary `skill` with its existing index, or an equipped `item`, which carries the battle-domain `targetMode` so no consumer interprets effect types). The item is never a synthetic catalogue entry: ordinary skill indexes are untouched and it is therefore never a candidate for AI skill selection
- `skillPreviewModel.ts` — Manual target-preview contracts: `SkillPreviewModel` (skill), `ItemRevivePreviewModel` (structured item-resurrection data — target, restored HP, cells, NO display text) and their union `BattleTargetPreviewModel`. Wording is `objects/battleSkillPreviewPresentation.ts`
- `worldTypes.ts` — Map contracts: `SubMapDefinition`, `SubMapState`, `LayoutCell`, `MapEntityType`

## Skill Contract Layers

- **`skillDefinitionTypes.ts`** — `ActionSkillDefinition` is the sole active skill authoring contract.
  All skills in `data/skills/skillDefinitions.ts` are authored in this format. Stores intent and registry
  refs (unresolved string names); resolution happens in the compiler.
- **`skillTypes.ts`** — Combat primitive and semantic input types. Legacy block-shaped skill
  interfaces have been removed. Current combat helper inputs are `DamageModifierRef`,
  `PostDamageEffect`, `InstantEffectApplication`, and `AppliedEffectMeta`; they are imported
  by both `combat.ts` and `skillUsePlan.ts`. Not part of `SkillUsePlan` action fields.
  `DamageType` and `SkillEffectBlock` have been removed. Effect registry classification now
  uses `LeveledEffectDef.effectKind`.
- **`src/battle/skillUsePlan.ts`** — `SkillUsePlan` (runtime contract). Used by executor, preview,
  targeting, and presentation. `compileSkillUsePlan` compiles `ActionSkillDefinition` → `SkillUsePlan`.

## Structural Role
`shared/` → foundation layer; all other folders depend on it, it depends on nothing

## Data Flow
Domain contracts defined here
↓
`data/` implements concrete definitions conforming to shared types
↓
`core/` computes state and projections using shared types
↓
`battle/`, `objects/`, `scenes/`, `ui/` consume read-only snapshots for rendering

## Dependencies
- depends on: nothing (zero external imports)
- used by: all folders — `battle/`, `core/`, `data/`, `objects/`, `scenes/`, `ui/`, `world/`

## Invariants
- No imports from any non-shared folder — enforced by `npm run check:boundaries`
- Types here are contracts only — no business logic
- Snapshot types (`snapshotTypes.ts`, `battleSnapshots.ts`) are read-only projections; mutable state lives in `core/`
- `battleSnapshots.ts` is separate from `snapshotTypes.ts` because battle snapshots are rebuilt dynamically during placement/battle phases

## Where to Modify
- change grid coordinates or cell addressing → `gridTypes.ts`
- change unit stats, class list, or progression structure → `unitTypes.ts`
- change skill runtime bridge types (damage types, effects, patterns) → `skillTypes.ts`
- change skill authoring contract → `skillDefinitionTypes.ts`
- change equipment slots, item effects, or any item failure vocabulary → `itemTypes.ts`
- change what data UI receives for unit/item display → `snapshotTypes.ts`
- change what data is available during battle/placement phase → `battleSnapshots.ts`
- change map layout or world entity structure → `worldTypes.ts`

## Future domains (not yet physical folders)
`campaign/`, `dialogue/`, `debug/`, `save/`
These will live at `src/` top level and import from `shared/` + `data/`.
(`inventory/` and `progression/` already exist as physical top-level domains.)
