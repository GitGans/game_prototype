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
- `skillTypes.ts` — Combat primitive and semantic input types: `Effect`, `SkillPattern`, `DamageType`, and semantic refs (`DamageModifierRef`, `PostDamageEffect`, `InstantEffectApplication`, `AppliedEffectMeta`) used by `combat.ts` and `skillUsePlan.ts`. Legacy block interfaces (`SkillEffectBlock`, `PostDamageBlock`, `DamageModifierBlock`, `InstantEffectBlock`) remain but are no longer used at the combat helper boundary.
- `skillDefinitionTypes.ts` — Active authoring contract: `ActionSkillDefinition`, action types, target policy types, matrix refs, power source types
- `itemTypes.ts` — Item/equipment: `ItemDefinition`, `ItemInstance`, `ItemContainer`, `EquipSlot`
- `snapshotTypes.ts` — UI projections: `UnitStatsSnapshot`, `SkillIconSnapshot`, `BackpackSnapshot`, `EquipmentSnapshot`
- `battleSnapshots.ts` — Battle-phase projections: `BenchUnitSnapshot` (rebuilt dynamically per phase)
- `worldTypes.ts` — Map contracts: `SubMapDefinition`, `SubMapState`, `LayoutCell`, `MapEntityType`

## Skill Contract Layers

- **`skillDefinitionTypes.ts`** — `ActionSkillDefinition` is the sole active skill authoring contract.
  All skills in `data/skillDefinitions.ts` are authored in this format. Stores intent and registry
  refs (unresolved string names); resolution happens in the compiler.
- **`skillTypes.ts`** — Combat primitive and semantic input types. Legacy block interfaces
  (`SkillEffectBlock`, `PostDamageBlock`, `DamageModifierBlock`, `InstantEffectBlock`) remain here
  but are no longer used at the combat helper boundary. Semantic combat input types
  (`DamageModifierRef`, `PostDamageEffect`, `InstantEffectApplication`, `AppliedEffectMeta`) are
  imported by both `combat.ts` and `skillUsePlan.ts`. Not part of `SkillUsePlan` action fields.
  `DamageType` is retained temporarily for effect-registry metadata
  (`LEVELED_EFFECTS.effectDamageType`). It is not used in skill damage resolution.
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
- change equipment slots or item effects → `itemTypes.ts`
- change what data UI receives for unit/item display → `snapshotTypes.ts`
- change what data is available during battle/placement phase → `battleSnapshots.ts`
- change map layout or world entity structure → `worldTypes.ts`

## Future domains (not yet physical folders)
`campaign/`, `inventory/`, `progression/`, `dialogue/`, `debug/`, `save/`
These will live at `src/` top level and import from `shared/` + `data/`.
