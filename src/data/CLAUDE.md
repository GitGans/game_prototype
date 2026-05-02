# data

## Role
Static data layer for all game entities. Contains only read-only constant definitions — no logic, no state, no side effects.

## Responsibilities
- Define all playable and enemy unit blueprints (stats, skills, upgrade tiers)
- Define all combat skills, damage patterns, and effect matrices
- Define equippable and consumable item configurations
- Define world/battle map layouts and entity placement
- Define enemy encounter group compositions
- Define grid occupancy shapes for units

## Key Files
- `unitDefinitions.ts` — player and enemy unit blueprints; exports `PLAYER_UNITS`, `ENEMY_UNITS`, `PLAYER_STARTING_IDS`
- `skillDefinitions.ts` — 28 combat skills, damage/effect matrices, level tables; exports `SKILLS`, `DAMAGE_MATRICES`, `EFFECT_MATRICES`, `INSTANT_EFFECT_MATRICES`, `LEVELED_EFFECTS`, `DAMAGE_MODIFIER_LEVELS`, `VAMPIRISM_LEVELS`; runtime helpers live in `src/battle/skillDefinitionRuntime.ts`
- `itemDefinitions.ts` — item configs with stat bonuses and slot assignments; exports `ITEM_DEFINITIONS`, `getItemDescription()`
- `mapDefinitions.ts` — grid terrain and mob placement per map; exports `MAP_DEFINITIONS`
- `enemyGroupDefinitions.ts` — encounter group configs (race + level override); exports `ENEMY_GROUPS`
- `shapeDefinitions.ts` — grid cell offset patterns per shape; exports `SHAPES`

## Structural Role
`src/data` → source-of-truth definitions consumed by `src/core`, `src/battle`, and `src/scenes`

## Data Flow
Game startup / phase transition
↓
`src/core` and `src/scenes` read constants from `src/data`
↓
Runtime objects (units, skills, items) are built from these definitions
↓
Live game state in `BattleState` / `CampaignState`

## Dependencies
- depends on: `src/shared/` (type definitions only)
- used by: `src/core/` (PhaseManager, battleInitialization, battleSetupProjection), `src/scenes/` (Preloader, Game, WorldMap), `src/battle/` (combat, shapes)

## Invariants
- All exports are `const` — no mutable state
- No imports from `src/core`, `src/scenes`, or `src/battle` — data flows one way
- `unitDefinitions.ts` may only import from within `src/data` (shapes, skills)
- No runtime helper functions — all skill runtime lookups live in `src/battle/skillDefinitionRuntime.ts`
- Adding a new entity requires only adding to the relevant constant; no registration elsewhere

## Where to Modify
- add/change a player or enemy unit → `unitDefinitions.ts`
- add/change a skill or damage pattern → `skillDefinitions.ts`
- add/change an item → `itemDefinitions.ts`
- add/change a map layout → `mapDefinitions.ts`
- add/change an enemy encounter group → `enemyGroupDefinitions.ts`
- add/change a unit grid shape → `shapeDefinitions.ts`
