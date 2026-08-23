# world

## Role
Map navigation logic for the world exploration phase. Provides movement validation, entity resolution, and state initialization — sitting between raw type definitions (`src/shared/worldTypes`) and consumers (scenes, core).

## Responsibilities
- Validate player movement (bounds + terrain collision)
- Resolve what entity (if any) exists at a given cell, respecting alive/dead state
- Initialize per-map entity tracking state on first entry
- Define which terrain types are impassable
- Configure per-entity-type interaction behavior (e.g. triggers on enter vs. on action)
- Re-export shared world types for consumers

## Key Files
- `mapLogic.ts` — core navigation functions: `canMove`, `resolveCell`, `initSubMapState`
- `mapCompletion.ts` — `wouldMapBeClearedAfterDefeatingMob(mapDefinition, mapState, triggerPos)`: pure map-completion rule, distinct from `mapLogic.ts`'s movement/resolution logic. Answers "if this mob were defeated, would the map have no live mobs left?" by projecting a virtual `SubMapState` and delegating to `allMobsDead()`. Takes the map definition/state as explicit parameters rather than reading `GameState`, so it's usable from `PhaseManager` (which computes the caller-side `{ mapCleared }` metadata for `core/phaseTransitionResolver.ts`) without either module reading runtime state.
- `types.ts` — re-exports from `src/shared/worldTypes`, adds `ResolvedCell`, `IMPASSABLE_TERRAIN`, `ENTITY_TYPE_CONFIG`, `WorldState` (`{ currentMapId, partyPos, subMapStates }` — the persistent-campaign-location contract nested inside `CampaignState.world`)

## Structural Role
`world/` → stateless map logic layer between data definitions and scene/core consumers

## Data Flow
`SubMapDefinition` (map layout + entity placements)
↓
`canMove` / `resolveCell` query functions
↓
movement allowed or `ResolvedCell` with entity metadata
↓
scene triggers transition or PhaseManager advances phase

## Dependencies
- depends on: `src/shared/worldTypes` (type contracts)
- used by: `src/scenes/WorldMap.ts` (movement + encounter handling, reading from the `world_map`
  phase snapshot — never `GameState` directly), `src/core/initCampaignState.ts` (initializes a
  `SubMapState` for every static map), `src/core/worldMapProjection.ts` /
  `src/core/PhaseManager.ts` (state init + phase transitions), `src/campaign/` (`WorldState`
  is nested inside `CampaignState`); `mapCompletion.ts` is used by `src/core/PhaseManager.ts`
  (`wouldClearMap()`) to compute the `{ mapCleared }` metadata passed into
  `src/core/phaseTransitionResolver.ts`

## Invariants
- `canMove`, `resolveCell`, and `wouldMapBeClearedAfterDefeatingMob` are pure functions — no side effects, no state mutation
- Entity alive/dead state lives in `SubMapState`, never in the map definition itself
- Dead entities are treated as passable empty cells
- `ENTITY_TYPE_CONFIG` is the single source of triggering behavior per entity type
- All world types must be sourced from `src/shared/worldTypes`, not redefined here

## Where to Modify
- add/change terrain that blocks movement → `IMPASSABLE_TERRAIN` in `types.ts`
- change whether an entity type triggers on enter → `ENTITY_TYPE_CONFIG` in `types.ts`
- change movement bounds or collision logic → `canMove` in `mapLogic.ts`
- change how entities are resolved from cell data → `resolveCell` in `mapLogic.ts`
- change initial per-map state shape → `initSubMapState` in `mapLogic.ts`
- change the map-clear/completion rule → `mapCompletion.ts`
- add new world-level types → `src/shared/worldTypes`, then re-export in `types.ts`
