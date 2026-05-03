# core

## Role
Central orchestration and game state layer. Controls all game flow, manages persistent and battle state, and produces render-ready snapshots for scenes.

## Responsibilities
- Own the phase state machine — validate and execute all game transitions
- Maintain persistent campaign data (units, items, money, map progress)
- Initialize battle state from campaign snapshot
- Build display snapshots (bench cards, stats, upgrades) for each phase
- Resolve unit progression (skills, stat modifiers) from chosen upgrades
- Isolate debug mode state from campaign saves

## Key Files
- `PhaseManager.ts` — master state machine; single entry point for all transitions via `transition(action)`
- `phases.ts` — `GamePhase` and `PhaseAction` discriminated unions; the contracts between UI and core
- `GameState.ts` — persistent singleton holding `CampaignState` and `BattleState`
- `battleInitialization.ts` — battle state factory; builds auto-placed or replay battle states
- `battleSetupProjection.ts` — builds typed placement candidates with embedded unit factory functions
- `unitProgression.ts` — resolves chosen upgrade effects into skills and stat modifiers
- `unitPreviewSnapshot.ts` — builds bench card snapshots for each player unit
- `unitStatsSnapshot.ts` — computes base and final stats for display
- `unitUpgradePresentation.ts` — generates upgrade text, stat lines, and skill descriptions for UI
- `DebugBattleState.ts` — isolated state container for debug battles; never syncs to `GameState`
- `EventBus.ts` — `STATE_CHANGED` event singleton; scenes subscribe via `sceneEvents.ts`
- `sceneEvents.ts` — binds Phaser scene lifecycle to `STATE_CHANGED` with auto-cleanup
- `Constants.ts` — grid layout, bench config, combat constants (visual colors removed; see `src/objects/battleVisualTheme.ts`)
- `phaseHandlers/battlePhaseHandler.ts` — routes battle placement actions; delegates to `../battle/placementState`

## Structural Role
`core` → game logic and state authority; all other layers read from it, none write to it directly

## Data Flow
`PhaseAction` dispatched from scene
↓
`PhaseManager.transition()` — validates via `resolveTransition()` (pure, no side effects)
↓
`applyActionSideEffects()` — mutates `GameState` / `DebugBattleState`, creates battle state
↓
`rebuildSnapshot()` — reads state, produces new `GamePhase` snapshot
↓
`syncPhaserScenes()` — starts/stops scenes; emits `STATE_CHANGED`
↓
Scenes re-render from new `GamePhase`

## Dependencies
- depends on: `src/battle/` (unit factory, placement logic, item ops, auto-place), `src/data/` (unit/enemy blueprints, item definitions)
- used by: `src/scenes/` (all scenes call `PhaseManager.transition()`), `src/objects/` (reads snapshots from `GamePhase`)

## Invariants
- `resolveTransition()` must remain pure — no Phaser calls, no state mutations
- All state mutations happen exclusively inside `applyActionSideEffects()`
- `DebugBattleState` must never be written into `GameState`
- Scenes never call `this.scene.start/stop` — only `PhaseManager` does
- `GamePhase` is the single source of truth for every scene's render data

## Battle Phase Boundary

`PhaseManager` owns battle lifecycle transitions, all state mutation side effects, and `GamePhase` snapshot rebuilding.

`PhaseManager.rebuildSnapshot()` is the bridge from mutable `GameState` / `BattleState` to the scene-facing render/control snapshot. It may import battle formulas (`getActiveSkill`, `compileSkillUsePlan`, `isFriendlyOrSelfTargetPolicy`, `hasChargedThisRound`) to compute snapshot fields — this is correct because core is deriving presentation-relevant data from authoritative state.

**Acceptable `GameState` reads:** core state initialization, `applyActionSideEffects()`, `rebuildSnapshot()`.

**Not acceptable:** direct `GameState` reads in scenes, scene controllers, or battle render paths. Use `PhaseManager.getPhase()` and snapshot fields instead.

## Where to Modify
- Add a new game screen → `phases.ts` (new `GamePhase` variant) + `PhaseManager.ts` (`resolveTransition`, `applyActionSideEffects`, `syncPhaserScenes`)
- Add a new player action → `phases.ts` (`PhaseAction`) + `PhaseManager.ts` (`applyActionSideEffects`)
- Change battle placement logic → `phaseHandlers/battlePhaseHandler.ts`
- Change battle turn-flow action handling → `phaseHandlers/battlePhaseHandler.ts` and `PhaseManager.applyActionSideEffects()`
- Change battle snapshot fields (what controllers see) → `PhaseManager.rebuildSnapshot()`
- Change how units are initialized for battle → `battleInitialization.ts` / `battleSetupProjection.ts`
- Change upgrade stat/skill resolution → `unitProgression.ts`
- Change bench card display data → `unitPreviewSnapshot.ts`
- Change stat display computation → `unitStatsSnapshot.ts`
- Change upgrade description text → `unitUpgradePresentation.ts`
- Change grid/bench layout constants → `Constants.ts`
- Change debug mode initial state → `DebugBattleState.ts`
- Change cross-scene event wiring → `EventBus.ts` / `sceneEvents.ts`
