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
- `unitDefinitions.ts` — compatibility re-export shim; do not add content here
- `units/playerUnits.ts` — player unit blueprints; exports `PLAYER_UNITS`, `PLAYER_STARTING_IDS`; references upgrade tier definitions from `playerUnitUpgradeTiers.ts`
- `units/playerUnitUpgradeTiers.ts` — player unit upgrade tier definitions by templateId; internal to `data/units`, not exported from the barrel
- `units/enemyUnits.ts` — enemy unit blueprints by race; exports `ENEMY_UNITS`
- `units/upgradeOptionHelpers.ts` — internal helper `opt()` for building player upgrade options
- `units/index.ts` — barrel re-export for `src/data/units/`
- `skills/index.ts` — barrel for the skills package; re-exports everything below
- `skills/matrices.ts` — named multiplier, effect area, and probability matrices (`MULTIPLIER_MATRICES`, `EFFECT_AREA_MATRICES`, `PROBABILITY_MATRICES`). `MULTIPLIER_MATRICES` are used by `damage`, `heal`, and `apply_periodic_hp_effect`. `MULTIPLIER_MATRICES` and `PROBABILITY_MATRICES` use `ScalingSkillMatrix`: one base form (level 1 values) plus `scaling: { anchorPerLevelIncrease, otherPerLevelIncrease }`; runtime computes any level on the fly via linear formula — no explicit level entries. `EFFECT_AREA_MATRICES` are static shape-only patterns (`EffectAreaPattern`) for `apply_stat_effect` — no levels, no scaling; cells are always `A()` = `{ multiplier: 1 }` and are not used for magnitude.
- `skills/effects.ts` — effect metadata registries (`STAT_EFFECTS`, `PERIODIC_HP_EFFECTS`). Effect magnitude comes from `STAT_EFFECTS[effectName].bonusByLevel`.
- `skills/attackAdjustments.ts` — damage modifier and vampirism level tables (`DAMAGE_MODIFIER_LEVELS`, `VAMPIRISM_LEVELS`)
- `skills/skillDefinitions.ts` — 28 combat skill registry and validated id helper (`SKILLS`, `sid()`); runtime helpers live in `src/battle/skillDefinitionRuntime.ts`
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
- `SkillId` references must always be created via `sid()` from `skillDefinitions.ts`.
  Direct casts (`"name" as SkillId`) are forbidden outside of `sid()` itself. Enforced by code review.
  `sid()` lives in `skills/skillDefinitions.ts` and is exported via `skills/index.ts`.

## Where to Modify
- add/change a player unit or PLAYER_STARTING_IDS → `units/playerUnits.ts`
- add/change player unit upgrade tiers → `units/playerUnitUpgradeTiers.ts`
- add/change an enemy unit → `units/enemyUnits.ts`
- add/change a skill definition → `skills/skillDefinitions.ts`
- add/change a damage or area matrix → `skills/matrices.ts`
- add/change a stat or periodic HP effect → `skills/effects.ts`
- add/change damage modifier or vampirism levels → `skills/attackAdjustments.ts`
- add/change an item → `itemDefinitions.ts`
- add/change a map layout → `mapDefinitions.ts`
- add/change an enemy encounter group → `enemyGroupDefinitions.ts`
- add/change a unit grid shape → `shapeDefinitions.ts`
