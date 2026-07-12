# core

## Role
Central orchestration and game state layer. Controls all game flow, manages persistent and battle state, and produces render-ready snapshots for scenes.

## Responsibilities
- Own the phase state machine — validate and execute all game transitions
- Own separate runtime references for persistent campaign data, debug session data, and battle state
- Initialize battle state from the active player session (campaign or debug)
- Build display snapshots (bench cards, stats, upgrades) for each phase
- Invoke progression resolvers from `src/progression/` to build battle-ready unit input
- Isolate debug session state from campaign — same `RosterState`/`InventoryState` types, never shared instances

## Key Files
- `PhaseManager.ts` — master state machine; single entry point for all transitions via `transition(action)`
- `phases.ts` — `GamePhase` and `PhaseAction` discriminated unions; the contracts between UI and core
- `GameState.ts` — runtime singleton owning three separate references: `CampaignState`, `DebugBattleState`, and battle runtime (`BattleState` + mode/turn context). Exposes only replacement methods (`setCampaignState`, `replaceCampaignRoster`, `replaceCampaignInventory`, `setDebugState`, `replaceDebugSession`, ...) — no writable flat fields.
- `playerSessionState.ts` — `PlayerSessionState { roster, inventory }`, the core-only composition of the two player-owned domains; used by `DebugBattleState.session`
- `initCampaignState.ts` — pure campaign factory; the only place `CampaignState` is constructed
- `debugPlayerSession.ts` — pure debug session factory; the only place a debug `PlayerSessionState` is constructed
- `DebugBattleState.ts` — `{ session: PlayerSessionState, initialConfig: DebugSessionConfig }`; owned by `GameState`, never placed inside `CampaignState`
- `worldMapProjection.ts` — pure projections used by `PhaseManager`'s `world_map` phase: `projectWorldMapSnapshot` (CampaignState.world → phase snapshot) and `applyMovePartyToCampaign`. Kept outside `PhaseManager.ts` (which imports the real `phaser` package) so this logic is unit-testable without a Phaser instance.
- `battleInitialization.ts` — battle state factory; builds auto-placed or replay battle states
- `battleSetupProjection.ts` — builds typed placement candidates with embedded unit factory functions
- `unitStatsSnapshot.ts` — computes base and final stats for display
- `unitUpgradePresentation.ts` — generates upgrade text, stat lines, and skill descriptions for UI
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
- depends on: `src/battle/` (unit factory, placement logic, auto-place), `src/inventory/` (equip/unequip, equipment bonuses, inventory snapshots), `src/data/` (unit/enemy blueprints, item definitions), `src/progression/` (unit progression and skill resolution)
- used by: `src/scenes/` (all scenes call `PhaseManager.transition()`), `src/objects/` (reads snapshots from `GamePhase`)

## Invariants
- `resolveTransition()` must remain pure — no Phaser calls, no state mutations
- All state mutations happen exclusively inside `applyActionSideEffects()`
- `DebugBattleState` must never be placed inside `CampaignState` and must never be serialized —
  it is stored beside campaign state in `GameState`, not inside it
- Campaign and debug state must never share mutable `RosterState`/`InventoryState` instances,
  even though they use the same types
- Scenes never call `this.scene.start/stop` — only `PhaseManager` does
- `GamePhase` is the single source of truth for every scene's render data; `WorldMap` reads
  its map state and party position from the `world_map` phase snapshot, never from `GameState`
  directly

## Battle Phase Boundary

`PhaseManager` owns battle lifecycle transitions, all state mutation side effects, and `GamePhase` snapshot rebuilding.

`PhaseManager.rebuildSnapshot()` is the bridge from mutable `GameState` / `BattleState` to the scene-facing render/control snapshot. It may import battle formulas (`getActiveSkill`, `compileSkillUsePlan`, `isAliveFriendlyTargetPolicy`, `hasChargedThisRound`) to compute snapshot fields — this is correct because core is deriving presentation-relevant data from authoritative state.

**Acceptable `GameState` reads:** core state initialization, `applyActionSideEffects()`, `rebuildSnapshot()`.

**Not acceptable:** direct `GameState` reads in scenes, scene controllers, or battle render paths. Use `PhaseManager.getPhase()` and snapshot fields instead.

## Where to Modify
- Add a new game screen → `phases.ts` (new `GamePhase` variant) + `PhaseManager.ts` (`resolveTransition`, `applyActionSideEffects`, `syncPhaserScenes`)
- Add a new player action → `phases.ts` (`PhaseAction`) + `PhaseManager.ts` (`applyActionSideEffects`)
- Change battle placement logic → `phaseHandlers/battlePhaseHandler.ts`
- Change battle turn-flow action handling → `phaseHandlers/battlePhaseHandler.ts` and `PhaseManager.applyActionSideEffects()`
- Change battle snapshot fields (what controllers see) → `PhaseManager.rebuildSnapshot()`
- Change how units are initialized for battle → `battleInitialization.ts` / `battleSetupProjection.ts`
- Change upgrade stat/skill resolution → `src/progression/`
- Change unit snapshot views (bench/field/lookup) → `battleSnapshotBuilder.ts` (`buildBattleUnitSnapshotViews`, the canonical battle phase read-model builder)
- Change stat display computation → `unitStatsSnapshot.ts`
- Change upgrade description text → `unitUpgradePresentation.ts`
- Change grid/bench layout constants → `Constants.ts`
- Change debug session initial config/contracts → `DebugBattleState.ts`; change how a debug session is built → `debugPlayerSession.ts`
- Change campaign initial content/config → `src/data/campaignInitialStateDefinition.ts`; change how a campaign is built → `initCampaignState.ts`
- Change world_map snapshot projection or party movement → `worldMapProjection.ts`
- Change cross-scene event wiring → `EventBus.ts` / `sceneEvents.ts`
