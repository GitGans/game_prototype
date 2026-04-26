# shared/

Dependency-free domain contracts. Every type here is import-safe from any layer.

## Invariants
- No imports from `battle/`, `core/`, `data/`, `objects/`, `scenes/`, `ui/`, `world/`
- Intra-shared imports (e.g. `unitTypes` imports from `gridTypes`) are allowed
- Enforced by `npm run check:boundaries`

## Files
- `gridTypes.ts`       — `Side`, `Row`, `Col`, `CellCoord`, `UnitShape` (grid geometry primitives)
- `skillTypes.ts`      — `Skill`, `Effect`, `DamageBlock`, `SkillPattern`, all skill-system types
- `unitTypes.ts`       — `UnitBlueprint`, `UnitClass`, `UnitBattleStats`, progression types
- `itemTypes.ts`       — `ItemDefinition`, `ItemContainer`, `BattleStatBonuses`, equip types
- `snapshotTypes.ts`   — Generic read-only UI projections: stats, skills, items, unit tabs
- `battleSnapshots.ts` — Battle-phase render snapshots (`BenchUnitSnapshot`); distinct from
                         `snapshotTypes` because these are rebuilt during placement/battle only
- `worldTypes.ts`      — Map/world contracts: `SubMapDefinition`, `SubMapState`, layout/entity types

## Future domains (not yet physical folders)
`campaign/`, `inventory/`, `progression/`, `dialogue/`, `debug/`, `save/`
These will live at `src/` top level and import from `shared/` + `data/`.
