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
- `GameState.ts` — runtime singleton owning three separate references: `CampaignState`, `DebugBattleState`, and battle runtime (`BattleState` + mode/turn context). Exposes only replacement methods (`setCampaignState`, `replaceCampaignRoster`, `replaceCampaignInventory`, `setDebugState`, `replaceDebugRoster`, `replaceDebugInventory`, ...) — no writable flat fields. `replaceDebugSession()` is a `@deprecated` migration bridge kept only for the pre-Stage-7 battle-exit persistence path; camp and upgrade no longer use it (Stage 3); scheduled for removal when Stage 7 migrates battle exit to `PlayerSessionStore`.
- `playerSessionState.ts` — `PlayerSessionSource = 'campaign' | 'debug'`, a core-only routing key (must never be imported by `inventory/`, `progression/`, `battle/`, `campaign/`, `world/`); `PlayerSessionState { roster, inventory }`, the core-only composition of the two player-owned domains; used by `DebugBattleState.session`
- `playerSessionStore.ts` — `PlayerSessionStore`: the sole seam that resolves a `PlayerSessionSource` to campaign or debug runtime storage (`getSession`, `replaceRoster`, `replaceInventory`). Storage-only — contains no inventory/progression/validation rules.
- `equipmentScreenSnapshot.ts` — `buildEquipmentScreenPlayerSnapshot(session, selectedUnitTemplateId)`: the one player-equipment projection shared by both `equip_screen` and `debug_equip_screen`. Takes a `PlayerSessionState` directly — never reads `GameState`, never branches on campaign/debug.
- `phaseHandlers/inventoryPhaseHandler.ts` — `applyEquipmentPhaseAction({ source, action })`: the only mutation point for `equip_item`/`unequip_item`. Resolves the session via `PlayerSessionStore`, delegates to the pure `inventory/` domain, writes back only on success. No Phaser, no phase-type/backpack-ID knowledge.
- `phaseHandlers/campPhaseHandler.ts` — `applyCampPhaseAction({ source, action })`: the only mutation point for `toggle_camp_unit`. Resolves the session via `PlayerSessionStore`, delegates to `progression/rosterCamp.ts`'s `toggleUnitCampStatus()`, writes back only on success. Contains no camp rules itself.
- `phaseHandlers/progressionPhaseHandler.ts` — `applyChooseUpgradePhaseAction({ source, unitTemplateId, action })`: the only mutation point for `choose_upgrade`. Resolves the session via `PlayerSessionStore`, delegates to `progression/rosterUpgrades.ts`'s `chooseUnitUpgrade()`, writes back only on success. Contains no upgrade rules itself.
- `rosterCampSnapshot.ts` — `buildRosterCampSnapshot(roster)`: the one camp read-model projection shared by `camp` and `debug_equip_screen`. Takes a `RosterState` directly; builds the `PLAYER_UNITS`-ordered `CampUnitSnapshot[]` display list and forwards `activeLivingUnitCount`/`canStartBattle` from `progression/rosterCamp.ts`'s `getRosterPartyStatus()` — does not recompute either.
- `upgradeTreeSnapshot.ts` — `buildUpgradeTreePlayerSnapshot(roster, templateId)`: the one upgrade-tree read-model projection shared by campaign and debug. Takes a `RosterState` directly; returns the empty placeholder if the unit or blueprint is missing.
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
- Equipment, camp, and upgrade source (`PlayerSessionSource`) must be read once from the current
  phase's `sessionSource` field (`equip_screen`/`debug_equip_screen`/`camp`/`upgrade_tree`) —
  never derived from `phase.type`, `returnPhase`, debug-state presence, or backpack ID
- `PlayerSessionStore` is the only equipment/camp/upgrade path to campaign/debug storage;
  `equipItem`/`unequipItem`/`buildBackpackSnapshot`/`buildEquipmentSnapshot` operate on
  `InventoryState` and resolve the shared backpack structurally (`requireSharedBackpack`) — no
  equipment rule may compare `backpack_shared`/`backpack_debug` string IDs
- Camp and upgrade mutation rules live only in `progression/rosterCamp.ts` and
  `progression/rosterUpgrades.ts`; `PhaseManager` and its phase handlers contain no camp or
  upgrade business rules — they only resolve a session and delegate
- **Active-unit membership and battle-entry party validity have exactly one owner:
  `progression/rosterCamp.ts`.** `isActiveLivingUnit()` defines active membership
  (`lifeState === 'alive' && isInCamp === false`); `getRosterPartyStatus()` defines the `1..9`
  battle-entry range as `canStartBattle`. `rosterCampSnapshot.ts` projects both values into
  `GamePhase` without recomputing them; scenes (`Prep.ts`, `UnitSelectionPanel.ts`) consume
  `canStartBattle` for control state and `activeLivingUnitCount` only for label text — neither
  scene interprets the numeric range itself
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
- Change equip/unequip mutation logic → `phaseHandlers/inventoryPhaseHandler.ts`
- Change what the equip screens render (backpack, equipment, stats, skills, sprite, unit tabs) → `equipmentScreenSnapshot.ts`
- Change how campaign vs. debug storage is resolved for equipment/camp/upgrade → `playerSessionStore.ts`
- Change camp mutation rules (last-active-unit invariant) → `src/progression/rosterCamp.ts`; change camp mutation routing → `phaseHandlers/campPhaseHandler.ts`
- Change upgrade selection validation rules → `src/progression/rosterUpgrades.ts`; change upgrade mutation routing → `phaseHandlers/progressionPhaseHandler.ts`
- Change what the camp screens render (roster list, active count, battle-entry validity) → `rosterCampSnapshot.ts`
- Change what the upgrade-tree screen renders (tiers, options, lock state) → `upgradeTreeSnapshot.ts`
