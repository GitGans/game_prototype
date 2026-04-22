# core

## Role
The state and orchestration layer of the game. Owns all game state, drives screen transitions, and defines the type contract for phases and actions that the rest of the codebase consumes.

## Responsibilities
- Manage the full game phase state machine (menus → battle → camp → equip → map)
- Apply side effects (item mutations, unit upgrades, money) on phase transitions
- Build and expose read-only phase snapshots that scenes render from
- Maintain campaign-persistent and battle-scoped state as two distinct stores
- Provide shared layout constants and colors as a single source of truth
- Provide a cross-system event bus for reactive UI updates after mutations

## Key Files
- `PhaseManager.ts` — singleton orchestrator; owns `transition(action)`, snapshot rebuild, and Phaser scene lifecycle
  - `transition(action)` — full pipeline: resolve → side effects → rebuild → sync scenes
  - `resolveTransition(current, action)` — **pure** next-phase logic; no Phaser, no GameState
  - `syncPhaserScenes()` — only place allowed to start/stop Phaser scenes
- `phases.ts` — type definitions for `GamePhase` (discriminated union of 10 screen types), `PhaseAction` (23 transition types), and all snapshot types
- `GameState.ts` — singleton with two stores: `BattleState` (reset each battle) and campaign fields (persist across battles)
- `Constants.ts` — `LAYOUT_SCALE`, grid/cell dimensions, and `COLORS`; all pixel values must pass through `LAYOUT_SCALE`
- `EventBus.ts` — Phaser EventEmitter singleton; `Events.STATE_CHANGED` signals UI to refresh after mutations
- `DebugBattleState.ts` — parallel state store and factory for debug battles; keeps campaign data clean

## Structural Role
`core` → state + orchestration hub that all scenes, objects, and UI read from but never write to directly

## Data Flow
User input in scene
↓
`PhaseManager.transition(action)`
↓
`resolveTransition()` → next `GamePhase` (pure)
↓
`applyActionSideEffects()` → mutate `GameState`
↓
`rebuildSnapshot()` → populate phase data fields
↓
`syncPhaserScenes()` → start new Phaser scene
↓
Scene reads `PhaseManager.getPhase()` and renders

## Dependencies
- depends on: `src/data/` (unit/item/map definitions), `src/battle/` (autoPlace, itemOps), Phaser
- used by: every scene (`PhaseManager`), every visual component (`Constants`), battle/camp logic (`GameState`), all reactive UI (`EventBus`)

## Invariants
- `PhaseManager` is the only caller of `Phaser.Scene.start/stop` — scenes must never manage their own lifecycle
- `resolveTransition` must remain pure — no Phaser calls, no `GameState` reads or writes
- All side effects (state mutation, money, items) happen in `applyActionSideEffects`, never in `resolveTransition`
- Snapshots embedded in `GamePhase` are rebuilt on every transition; scenes must not cache them
- Debug state mutations are isolated to `DebugBattleState`; `GameState` must not be touched during debug phases
- All pixel sizes must be multiplied by `Constants.LAYOUT_SCALE` — no hardcoded pixel values

## Where to Modify
- add a new screen → `phases.ts` (new `GamePhase` variant + action) + `PhaseManager.ts` (`resolveTransition`, `syncPhaserScenes`)
- change phase transition logic → `PhaseManager.ts` `resolveTransition()`
- add a new side effect (item, money, upgrade) → `PhaseManager.ts` `applyActionSideEffects()`
- change snapshot data exposed to scenes → `phases.ts` (type) + `PhaseManager.ts` `rebuildSnapshot()`
- add a layout constant or color → `Constants.ts`
- add persistent campaign data → `GameState.ts` `CampaignState` / `GameStateManager`
- add a new cross-scene event → `EventBus.ts` `Events`
