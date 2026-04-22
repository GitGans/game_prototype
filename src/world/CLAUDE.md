# world

## Role
Defines the data model and pure query logic for the overworld grid system. This is the foundation for world map traversal — the layer between player movement and encounter triggering.

## Responsibilities
- Define types for map layouts, entities, and runtime state
- Provide passability checks for movement validation
- Resolve cell queries, including dead entity handling and trigger behavior
- Initialize runtime state for submaps

## Key Files
- `types.ts` — all type definitions and entity configuration
  - `SubMapDefinition` — static map layout + entity declarations
  - `SubMapState` — runtime entity state (alive/dead flags)
  - `ResolvedCell` — query result with passability and trigger info
  - `ENTITY_TYPE_CONFIG` — per-entity trigger behavior (enter vs. interact)
  - `IMPASSABLE_TERRAIN` — set of blocking terrain strings
- `mapLogic.ts` — pure query functions over map data
  - `initSubMapState` — creates initial runtime state for a map
  - `canMove` — boundary + passability check
  - `resolveCell` — full cell resolution including dead entities and metadata

## Structural Role
world → data model and query interface for the world map scene

## Data Flow
SubMapDefinition (static layout + entities)
↓
initSubMapState → SubMapState (runtime alive flags)
↓
canMove / resolveCell called per player step
↓
ResolvedCell (passable flag + entity trigger info)
↓
WorldMap scene decides movement or encounter trigger
↓
PhaseManager.transition() routes to next phase

## Dependencies
- depends on: nothing (zero external dependencies)
- used by: `src/core/GameState.ts`, `src/core/PhaseManager.ts`, `src/scenes/WorldMap.ts`, `src/data/mapDefinitions.ts`

## Invariants
- All functions are pure — no Phaser, no state mutation, no side effects
- Dead entities (`alive: false` in `SubMapState`) must be treated as passable empty cells
- Mobs block movement (`passable: false`); camps, shops, and portals do not
- `ENTITY_TYPE_CONFIG` is the single source of truth for trigger behavior per entity type
- `SubMapDefinition` is static — only `SubMapState` changes at runtime

## Where to Modify
- add a new entity type → `types.ts` (`MapEntityType`, `ENTITY_TYPE_CONFIG`, entry type)
- change terrain blocking rules → `types.ts` (`IMPASSABLE_TERRAIN`)
- change movement validation → `mapLogic.ts` (`canMove`)
- change cell resolution or dead entity behavior → `mapLogic.ts` (`resolveCell`)
- change map initial state → `mapLogic.ts` (`initSubMapState`)
