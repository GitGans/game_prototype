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
- `GameState.ts` — runtime singleton owning three separate references: `CampaignState`, `DebugBattleState`, and a nullable `BattleRuntimeContext` (`battleRuntimeContext.ts`). Exposes only replacement methods (`setCampaignState`, `replaceCampaignRoster`, `replaceCampaignInventory`, `setDebugState`, `replaceDebugRoster`, `replaceDebugInventory`, `setBattleRuntime`, `replaceBattleState`, `replaceBattleMode`, `replaceBattleTurnContext`, `replacePendingAutoTurnIntention`, ...) — no writable flat fields. `getDebugState(): DebugBattleState | null` is for genuinely optional reads; `requireDebugState(): DebugBattleState` throws `'Debug state is not initialized'` and is mandatory wherever the current phase or runtime explicitly identifies the session as `debug` — an explicit `PlayerSessionSource` selects exactly one storage tree, and missing storage for that explicit source is a lifecycle error, never a silent fallback to the other tree. `replaceDebugSession()` is a `@deprecated` migration bridge kept only for the pre-Stage-8 battle-exit persistence path; camp and upgrade no longer use it (Stage 3); scheduled for removal when Stage 8 migrates battle exit to `PlayerSessionStore`.
- `battleExitRouting.ts` — `resolveBattleExitRoute(sessionSource, debugState)`: the pure decision of which battle-exit persistence branch applies. Never returns a `'debug'` route without a real `DebugBattleState` — throws instead of letting `PhaseManager`'s exit-teardown code fall back to campaign persistence. Takes both facts as plain arguments (no `GameState`/Phaser import) so it can be unit-tested directly, the same reason `worldMapProjection.ts` exists outside `PhaseManager.ts`.
- `battleRuntimeContext.ts` (Stage 4) — `BattleRuntimeContext`: the single owner of all mutable data for one active battle attempt (`state`, `participants`, `replaySetup`, `turnContext`, `mode`, `sessionSource`, `pendingAutoTurnIntention`). A battle phase is active if and only if `GameState`'s runtime is non-null; `runtime.sessionSource` must always equal the active battle phase's `sessionSource` — validated by `PhaseManager`'s private `requireBattleRuntime()` at every read/mutation site (snapshot rebuild, lifecycle/control/preview/turn/placement side effects, replay, exit), not only at render time. `createEmptyBattleState()` and `createBattleRuntimeContext()` are the only ways to produce a `BattleState` or a runtime; each returns independent, non-aliased collections. There is no separate restart factory — a replay builds one complete replacement runtime through the same `createBattleRuntimeContext()`. `BattleRuntimeContext` is never serialized and never exposed to scenes — `GamePhase.participants` is always a copy of `runtime.participants`, never the same array reference, so render data and persistence input never alias runtime-owned mutable state. `BattleReplaySetup` holds only the captured enemy placements needed to reconstruct the formation; the encounter ID lives on the battle phase and is not duplicated here. It is not a full deterministic battle snapshot.
- `playerSessionState.ts` — `PlayerSessionSource = 'campaign' | 'debug'`, a core-only routing key (must never be imported by `inventory/`, `progression/`, `battle/`, `campaign/`, `world/`); `PlayerSessionState { roster, inventory }`, the core-only composition of the two player-owned domains; used by `DebugBattleState.session`
- `playerSessionStore.ts` — `PlayerSessionStore`: the sole seam that resolves a `PlayerSessionSource` to campaign or debug runtime storage (`getSession`, `replaceRoster`, `replaceInventory`). Storage-only — contains no inventory/progression/validation rules.
- `equipmentScreenSnapshot.ts` — `buildEquipmentScreenPlayerSnapshot(session, selectedUnitTemplateId)`: the one player-equipment projection shared by both `equip_screen` and `debug_equip_screen`. Takes a `PlayerSessionState` directly — never reads `GameState`, never branches on campaign/debug.
- `phaseHandlers/inventoryPhaseHandler.ts` — `applyEquipmentPhaseAction({ source, action })`: the only mutation point for `equip_item`/`unequip_item`. Resolves the session via `PlayerSessionStore`, delegates to the pure `inventory/` domain, writes back only on success. No Phaser, no phase-type/backpack-ID knowledge.
- `phaseHandlers/campPhaseHandler.ts` — `applyCampPhaseAction({ source, action })`: the only mutation point for `toggle_camp_unit`. Resolves the session via `PlayerSessionStore`, delegates to `progression/rosterCamp.ts`'s `toggleUnitCampStatus()`, writes back only on success. Contains no camp rules itself.
- `phaseHandlers/progressionPhaseHandler.ts` — `applyChooseUpgradePhaseAction({ source, unitTemplateId, action })`: the only mutation point for `choose_upgrade`. Resolves the session via `PlayerSessionStore`, delegates to `progression/rosterUpgrades.ts`'s `chooseUnitUpgrade()`, writes back only on success. Contains no upgrade rules itself.
- `rosterCampSnapshot.ts` — `buildRosterCampSnapshot(roster)`: the one camp read-model projection shared by `camp` and `debug_equip_screen`. Takes a `RosterState` directly; builds the `PLAYER_UNITS`-ordered `CampUnitSnapshot[]` display list and forwards `selectedForBattleUnitCount`/`activeLivingUnitCount`/`canStartBattle` from `progression/rosterCamp.ts`'s `getRosterPartyStatus()` — does not recompute any of them.
- `upgradeTreeSnapshot.ts` — `buildUpgradeTreePlayerSnapshot(roster, templateId)`: the one upgrade-tree read-model projection shared by campaign and debug. Takes a `RosterState` directly; returns the empty placeholder if the unit or blueprint is missing.
- `initCampaignState.ts` — pure campaign factory; the only place `CampaignState` is constructed
- `debugPlayerSession.ts` — pure debug session factory; the only place a debug `PlayerSessionState` is constructed
- `DebugBattleState.ts` — `{ session: PlayerSessionState, initialConfig: DebugSessionConfig }`; owned by `GameState`, never placed inside `CampaignState`
- `worldMapProjection.ts` — pure projections used by `PhaseManager`'s `world_map` phase: `projectWorldMapSnapshot` (CampaignState.world + roster party status → phase snapshot) and `applyMovePartyToCampaign`. Party status rides on the world-map snapshot so `resolveTransition` can reject `enter_battle` for an invalid party without reading roster state. Kept outside `PhaseManager.ts` (which imports the real `phaser` package) so this logic is unit-testable without a Phaser instance.
- `battleInitialization.ts` — battle state factory; builds auto-placed or replay battle states. `buildNewBattleState()` places players first (before any enemy RNG is consumed) and returns the ordered `playerPlacements` records alongside the state. `buildReplayBattleState()` returns `{ state, playerPlacements }` for the same reason: the replay attempt's participants must be built from *its own* placement records
- `battleSetupProjection.ts` — `projectPlayerBattleSetup(session)`: the one player battle-setup projection shared by campaign and debug. Takes a `PlayerSessionState` directly; never reads `GameState`, never branches on campaign/debug, never mutates the session. Projects **every** unit outside camp, alive or dead — a persistent-dead unit becomes a fully resolved candidate whose factory produces a canonical dead runtime unit. A blueprint with no roster record is skipped, never synthesized
- `battleParticipants.ts` — `buildInitialBattleParticipants(state, placements)`: the one participant builder for campaign and debug. The placement records are the initial-deployment truth (`wasOnBench` comes from the record, never from current `state.deployments`), and `isAlive` from the battle-domain `isAlive()` — so a unit that began the battle dead is present with `isAlive: false`. Reads only `BattleState` + records
- `battleStart.ts` — the one owner of battle-attempt construction for campaign and debug. `createBattleRuntimeForSession()` builds a new encounter (party status → setup projection → initialization with RNG → participants → runtime); `createReplayBattleRuntimeForSession()` rebuilds an attempt (party status → setup projection → enemy restoration from the captured `replaySetup` → participants → runtime). Neither takes a `BattleRuntimeContext`: replay receives only `session`, `replaySetup` and `sessionSource`, because those are the only facts that cross an attempt boundary — the previous attempt's participants, state, mode and turn context are out of scope by construction, not by convention. Both are pure composition: they return a runtime, never install one, never import `GameState`, and never accept map metadata. Neither branches on `sessionSource`; replay additionally consumes no RNG. Both throw on an invalid party (shared `assertPartyCanStartBattle`), because `resolveTransition` must already have rejected the action
- `unitStatsSnapshot.ts` — computes base and final stats for display
- `unitUpgradePresentation.ts` — generates upgrade text, stat lines, and skill descriptions for UI
- `EventBus.ts` — `STATE_CHANGED` event singleton; scenes subscribe via `sceneEvents.ts`
- `sceneEvents.ts` — binds Phaser scene lifecycle to `STATE_CHANGED` with auto-cleanup
- `Constants.ts` — grid layout, bench config, combat constants (visual colors removed; see `src/objects/battleVisualTheme.ts`)
- `playerUnitPersistence.ts` — the pure owner of persistent player-unit transformations (life state, HP, level, placement). `applyFieldPlacementsToRoster(roster, state)` applies a confirmed battle placement to a roster with no knowledge of `PlayerSessionSource` or storage: field-deployed player units, **living and dead alike**, get a copied `lastPlacement`; bench and undeployed units keep theirs; a field player with no roster record is a thrown lifecycle error, never a synthesized record. Battle-exit persistence (`applyBattleExitPlayerPersistence`) also lives here and is still applied only on the campaign exit route — that asymmetry ends in the unified battle-exit stage, not here.
- `phaseHandlers/battlePhaseHandler.ts` — battle lifecycle/turn/placement action routing (placement delegates to `../battle/placementState`), split into two explicitly separated layers. `applyBattleLifecycleAction({ state, action })` is the **pure battle-lifecycle rule**: it decides whether combat may begin and signals `persistPlayerPlacements`; it never touches storage and never branches on campaign/debug. `applyBattleLifecyclePhaseAction({ source, state, action })` is the **application seam**: it runs the pure rule and, when the signal is set, persists the pre-action placement into the session selected by `PlayerSessionStore`. It contains no placement rules of its own. `PhaseManager` calls only the application-level function. `AutoTurnIntention` is owned by `battleRuntimeContext.ts` and re-exported here for callers that already import from this module.

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
- **Battle runtime ownership has exactly one owner: `GameState`'s nullable `BattleRuntimeContext`.**
  No battle state, mode, turn context, participants, replay setup, or pending auto-turn intention
  exists outside it. `PhaseManager` never keeps its own `pendingAutoTurnIntention` field. Every
  compound battle-runtime change (more than one field) installs one complete replacement runtime
  via `GameState.setBattleRuntime()` — never two sequential writes for one action
- Battle session (`sessionSource: 'campaign' | 'debug'`) is read once from the active `battle`
  `GamePhase`, exactly like `equip_screen`/`camp`/`upgrade_tree` — never derived from
  `returnPhase`, debug-state presence, map metadata, or action type. A missing `DebugBattleState`
  when `sessionSource === 'debug'` is a thrown lifecycle error, never a silent fallback to
  campaign storage. This includes battle-exit routing: `exit_battle` branches only on
  `resolveBattleExitRoute(runtime.sessionSource, GameState.getDebugState())`
  (`battleExitRouting.ts`), never on a compound condition like `sessionSource === 'debug' &&
  debugState` that could silently select the campaign branch for a debug-sourced runtime
- Leaving the `battle` phase for any non-battle phase always clears the whole
  `BattleRuntimeContext` (`PhaseManager.transition()`, after side effects, before snapshot
  rebuild) — no completed or abandoned battle runtime survives into `battle_results` or any
  later phase
- **Battle selection and living-party validity are two different concepts, owned solely by
  `progression/rosterCamp.ts`.**
  `isSelectedForBattle()` (`isInCamp === false`) decides inclusion in battle setup and counts
  toward `MAX_SELECTED_BATTLE_PARTY_SIZE` — **dead units outside camp are selected**, because they
  receive a field or bench deployment like any other unit.
  `isActiveLivingUnit()` (`alive && !isInCamp`) governs `MIN_LIVING_BATTLE_PARTY_SIZE` and the
  last-living camp protection.
  `getRosterPartyStatus()` returns both counts plus `canStartBattle`. `rosterCampSnapshot.ts` and
  `worldMapProjection.ts` forward all three into `GamePhase` without recomputing them; scenes
  (`Prep.ts`, `UnitSelectionPanel.ts`, `WorldMap.ts`) consume `canStartBattle` for control state and
  the counts only for label text — no scene interprets the numeric bounds itself
- **Battle start has exactly one path:** `enter_battle` and `start_battle` share a single
  `applyActionSideEffects` branch that reads `sessionSource`/`enemyGroupId` from the already-resolved
  battle phase, resolves the session through `PlayerSessionStore`, and installs the result of
  `createBattleRuntimeForSession()` once. There are no campaign-specific or debug-specific setup
  adapters and no divergent participant construction
- **Party validity is enforced in `resolveTransition()`**, before any side effect runs, by reading
  `canStartBattle` off the current `world_map` / `debug_equip_screen` phase. An invalid party can
  therefore never partially mutate campaign or battle state, and no rejected-transition protocol is
  needed. Reaching `createBattleRuntimeForSession()` with an invalid party is a lifecycle error
- **`GamePhase.canBeginCombat`** is computed in `rebuildSnapshot()` from the battle-domain
  `canBeginCombat()` and enforced independently in `applyBattleLifecycleAction`. Scenes disable the
  begin-combat control from the boolean; they never inspect field membership or life state
- **Confirmed-placement persistence is source-neutral.** `battle_begin_combat` runs the same pure
  lifecycle rule and the same roster transformation for campaign and debug; only
  `applyBattleLifecyclePhaseAction` knows the `PlayerSessionSource`, and it uses it solely to select
  the storage tree. The **pre-action** `BattleState` is persisted, before the combat runtime is
  installed, so a lifecycle error aborts the transition with neither roster nor runtime written.
  Battle-**exit** persistence remains route-specific until the unified exit stage
- **Replay has exactly one policy.** `replay` runs the same pipeline for campaign and debug:
  it restores the captured enemy templates, levels and anchors from `runtime.replaySetup`, and
  re-projects player units from the **current** `PlayerSessionState`. Participants are rebuilt
  from the replay attempt's own `PlayerInitialPlacement[]` — a previous attempt's participant
  snapshot is never carried forward, because Stage 6 placement persistence can change the
  field/bench split between attempts and `wasOnBench` feeds exit persistence. This is enforced
  by the factory's signature, not by discipline: only `replaySetup` and `sessionSource` cross an
  attempt boundary, so the previous runtime's participants, state, mode and turn context are not
  in scope inside the replay pipeline. Player placement therefore comes from persistent
  `lastPlacement`, which after Stage 6 normally represents the confirmed pre-combat layout of
  the previous attempt. Replay is not a deterministic runtime or RNG snapshot. **Debug replay no
  longer rerolls enemies** — starting a new debug battle is the operation that creates a new
  encounter. `PhaseManager`'s replay branch contains no conditional: it resolves the session by
  `runtime.sessionSource` and installs the returned runtime once
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
- Change what a confirmed placement writes back to the roster → `playerUnitPersistence.ts` (`applyFieldPlacementsToRoster`); change which session it is written to → `phaseHandlers/battlePhaseHandler.ts` (`applyBattleLifecyclePhaseAction`)
- Change battle snapshot fields (what controllers see) → `PhaseManager.rebuildSnapshot()`
- Change how units are initialized for battle → `battleInitialization.ts` / `battleSetupProjection.ts`
- Change how a battle attempt is started or replayed (campaign or debug) → `battleStart.ts`
- Change the battle-start participant snapshot → `battleParticipants.ts`
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
