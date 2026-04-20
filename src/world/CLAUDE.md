# world

## Role
Pure domain logic for world map systems. Defines the grid structure, terrain passability, and entity resolution for explorable sub-maps. No Phaser, no battle logic.

## Responsibilities
- Define types for map layouts, terrain, and entity kinds (mob, camp, portal, shop)
- Determine whether a grid cell is passable for movement
- Resolve what entity occupies a cell and whether it triggers on entry
- Initialize empty runtime state for a map's entity lifecycle
- Track which entities are alive across battles

## Key Files
- `types.ts` — all world type definitions and constants (`SubMapDefinition`, `SubMapState`, `ResolvedCell`, `ENTITY_TYPE_CONFIG`, `IMPASSABLE_TERRAIN`)
- `mapLogic.ts` — pure navigation functions: `canMove`, `resolveCell`, `initSubMapState`

## Structural Role
`world/` → domain model for map traversal and entity interaction

## Data Flow
Map definitions (`src/data/mapDefinitions.ts`) + player position
↓
`canMove` / `resolveCell` query against `SubMapDefinition` and `SubMapState`
↓
Passability result or resolved entity data (type, trigger flag, payload)
↓
`WorldMap` scene uses result to move player or fire interaction

## Dependencies
- depends on: nothing (zero external imports)
- used by: `src/scenes/WorldMap.ts`, `src/core/GameState.ts`, `src/core/PhaseManager.ts`, `src/data/mapDefinitions.ts`

## Invariants
- All functions are pure and side-effect-free — they never mutate state
- `resolveCell` must respect `SubMapState.entityStates` to skip dead entities
- `canMove` must treat out-of-bounds as impassable
- `ENTITY_TYPE_CONFIG` must have an entry for every `MapEntityType` variant
- Entity alive/dead state is owned by `GameState`; `world/` only reads it via `SubMapState`

## Where to Modify
- Add a new entity type → `types.ts` (`MapEntityType`, `MapEntityEntries`, `ENTITY_TYPE_CONFIG`)
- Change passability rules → `mapLogic.ts` (`canMove`) + `types.ts` (`IMPASSABLE_TERRAIN`)
- Change entity trigger behavior → `types.ts` (`ENTITY_TYPE_CONFIG.triggersOnEnter`)
- Change what data a resolved cell returns → `mapLogic.ts` (`resolveCell`) + `types.ts` (`ResolvedCell`)
- Change map state initialization → `mapLogic.ts` (`initSubMapState`)
