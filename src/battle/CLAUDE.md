# battle

## Role
Pure TypeScript domain layer for all turn-based battle mechanics. No Phaser imports — contains only game logic: unit placement, combat resolution, skill targeting, turn ordering, and item operations.

## Responsibilities
- Define all battle data structures (units, skills, effects, items, grid)
- Resolve combat: damage, healing, buffs/debuffs, game-over
- Manage grid occupancy and unit placement validation
- Build and maintain turn order (initiative queue)
- Determine valid skill targets and resolve AoE patterns
- Handle item equip/unequip, stat bonuses, and item usage

## Key Files
- `types.ts` — all shared types: `Unit`, `BattleState`, `Skill`, `Effect`, `ItemDefinition`, grid coords
- `combat.ts` — damage, healing, effect application, vampirism, game-over check
- `autoPlace.ts` — unit instantiation from blueprints (level scaling + item bonuses) and grid placement at battle start
- `occupancy.ts` — bidirectional cell↔unit maps; `buildOccupancy()` must be called after any unit mutation
- `placement.ts` — placement validation (`canPlace`) and applying placement to state
- `initiative.ts` — `buildRoundQueue()`, `pruneQueue()`, `rebuildRemainingQueue()`
- `targeting.ts` — melee, ranged, friendly, and self target resolution
- `skillPatterns.ts` — expands `SkillPattern` relative to a target cell into `ResolvedHitCell[]`
- `itemOps.ts` — item move/equip/unequip, stat bonus aggregation, snapshot builders for scenes
- `field.ts` — grid coordinate helpers (`cellKey`, `cellExists`)
- `shapes.ts` — unit shape definitions and occupied-cell expansion

## Structural Role
`src/battle/` → pure domain logic consumed by scenes, phases, and objects

## Data Flow
`UnitBlueprint[]` + `ItemDefinition[]` from `src/data/`
↓
`createUnitInstance()` — applies level scaling and item bonuses
↓
`autoPlacePlayer()` / `autoPlaceEnemies()` — validates and places units; rebuilds occupancy
↓
`buildRoundQueue()` — sorts units by initiative
↓
per-turn loop: targeting → pattern resolution → combat resolution → state mutation → occupancy rebuild
↓
`checkGameOver()` — returns winning side when one side has no alive units

## Dependencies
- depends on: `src/data/` (unit, item, skill, enemy definitions), `src/core/GameState.ts`
- used by: `src/scenes/Game.ts`, `src/scenes/EquipScreen.ts`, `src/core/phases.ts`, `src/objects/`

## Invariants
- No Phaser imports anywhere in this folder
- `cellToUnit` and `unitToCells` in `BattleState.occupancy` must always be in sync — always call `buildOccupancy()` after mutating units
- Multi-cell units hit by AoE take the **highest** damage across all hit cells, not the sum
- Dodge and block are each capped at 90% effective chance (minimum 10% hit/unblock)
- Active effects per unit capped at 2; oldest is evicted when a third is applied
- Level scaling formula: `1 + 0.1 × (level − 1)` applied to hp and damage; defense is flat

## Where to Modify
- add/change a unit stat or skill type → `types.ts`
- change damage, healing, or effect resolution → `combat.ts`
- change turn order or initiative tie-breaking → `initiative.ts`
- change which cells a skill can target → `targeting.ts`
- change AoE shape resolution → `skillPatterns.ts`
- change unit instantiation or level scaling → `autoPlace.ts`
- change item equip rules or stat bonus calculation → `itemOps.ts`
- change placement validation rules → `placement.ts`
