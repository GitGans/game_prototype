# battle

## Role
Pure TypeScript domain layer for all turn-based battle mechanics. No Phaser imports allowed. Handles combat resolution, unit placement, skill targeting, item operations, and turn ordering.

## Responsibilities
- Define all battle types and data structures (units, skills, effects, items, state)
- Validate and resolve unit placement on the grid
- Calculate turn order and manage the round queue
- Resolve attacks, heals, skills, AoE patterns, and active effects
- Manage item equip/unequip and stat computation with level scaling
- Provide targeting rules for melee, ranged, friendly, and self skills

## Key Files
- `types.ts` — all shared types (`Unit`, `BattleState`, `Skill`, `ItemDefinition`, etc.); root of the dependency graph
- `combat.ts` — damage, dodge/block, vampirism, effect ticking, game-over check; `resolveAttack()`, `tickEffects()`, `checkGameOver()`
- `targeting.ts` — skill target selection by mode; `getMeleeTargets()`, `getRangedTargets()`, `getFriendlyTargets()`
- `skillPatterns.ts` — resolves AoE anchor → actual cells; `resolvePattern()`
- `initiative.ts` — builds and prunes the round queue; `buildRoundQueue()`, `pruneQueue()`
- `occupancy.ts` — bidirectional cell↔unit maps; `buildOccupancy()`, `removeUnit()`
- `placement.ts` — validates and applies grid placement; `canPlace()`, `placeUnit()`
- `autoPlace.ts` — auto-places player and enemy units; `autoPlacePlayer()`, `autoPlaceEnemies()`, `createUnitInstance()`
- `itemOps.ts` — equip/unequip, stat bonuses, level scaling; `equipItem()`, `computeUnitBattleStats()`
- `field.ts` — grid coordinate helpers; `cellKey()`, `cellExists()`
- `shapes.ts` — unit shape definitions and occupied-cell expansion; `getOccupiedCells()`

## Structural Role
`src/battle/` → pure domain logic; consumed by scenes, never imports from them

## Data Flow
Static definitions (`src/data/`) + `GameState`
↓
Units instantiated and placed (`autoPlace.ts`, `placement.ts`)
↓
Round queue built (`initiative.ts`)
↓
Turn: targeting → pattern resolution → combat resolution (`targeting.ts` → `skillPatterns.ts` → `combat.ts`)
↓
State change emitted → `src/scenes/Game.ts` reads updated `BattleState`

## Dependencies
- depends on: `src/data/` (unit/item/skill definitions), `src/core/GameState`
- used by: `src/scenes/Game.ts`, `src/scenes/Prep.ts`, `src/objects/` (read-only)

## Invariants
- Zero Phaser imports — this folder must remain pure TypeScript
- Large units (multi-cell) take the highest damage value across all hit cells, never the sum
- Dodge and block are each capped at 90% effective chance
- Vampirism heal is capped to actual damage dealt (no overkill healing)
- `cellToUnit` and `unitToCells` in occupancy maps must always stay in sync; use `buildOccupancy()` to reset
- Active effects per unit capped at 2; oldest evicted when full
- At equal initiative, turn order interleaves player → enemy → player

## Where to Modify
- Change damage / defense formula → `combat.ts`
- Change targeting rules → `targeting.ts`
- Change AoE patterns → `skillPatterns.ts` + `src/data/skillDefinitions.ts`
- Change turn order → `initiative.ts`
- Change placement validation → `placement.ts`
- Change auto-placement or level scaling → `autoPlace.ts`
- Change item equip / stat computation → `itemOps.ts`
- Add new type or equipment slot → `types.ts`
- Change grid coordinate helpers → `field.ts`
- Change unit shape definitions → `shapes.ts`
