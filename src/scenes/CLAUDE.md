# scenes

## Role
Scenes are the rendering and input layer of the game. Each scene corresponds to exactly one `GamePhase` and is responsible for displaying that phase's data and forwarding user input to `PhaseManager`.

## Responsibilities
- Render UI and game objects based on data from `GamePhase`
- Capture and route user input (clicks, keyboard, drag) to `PhaseManager.transition()`
- Subscribe to `EventBus` to react to state changes without polling
- Compose `src/ui/` and `src/objects/` components — no inline primitives
- Bootstrap and asset loading during startup

## Key Files
- `Boot.ts` — initializes `PhaseManager`, transitions immediately to `Preloader`
- `Preloader.ts` — loads all sprite sheets and images, then transitions to `MainMenu`
- `MainMenu.ts` — entry screen; routes to new game or debug flow
- `Game.ts` — battle scene; handles placement drag-and-drop, combat targeting, skill selection, and battle mode controls
- `WorldMap.ts` — keyboard-driven map navigation; triggers encounters, camps, and portals
- `Prep.ts` — pre-battle camp screen; manages party composition and equipment access
- `EquipScreen.ts` — unit equipment and item management; context-menu-driven equip/unequip/use
- `UpgradeTreeScreen.ts` — upgrade tier selection per unit
- `BattleResults.ts` — post-battle summary and level-up display
- `DebugLevelSelect.ts` — developer tool for picking a battle level directly
- `MapVictory.ts` — map completion celebration; routes back to main menu

## Structural Role
scenes → rendering + input forwarding (no logic ownership)

## Data Flow
`GamePhase` (read-only)
↓
scene renders phase data via `src/ui/` and `src/objects/` components
↓
user interaction event
↓
`PhaseManager.transition(action)` call
↓
PhaseManager resolves next phase and syncs scenes

## Dependencies
- depends on: `src/core/PhaseManager`, `src/core/GameState`, `src/core/EventBus`, `src/ui/`, `src/objects/`, `src/battle/`
- used by: Phaser scene registry (registered in game config); nothing imports scenes directly

## Invariants
- Scenes never call `this.scene.start/stop/launch` — all scene switching goes through `PhaseManager`
- Scenes never store mutable game state — all persistent data lives in `CampaignState` / `BattleState`
- Scenes never contain transition logic — no `if (victory) go somewhere` branches
- Scenes never pass data directly to other scenes — `GamePhase` is the only inter-scene channel
- All visual primitives come from `src/ui/` or `src/objects/` — no inline `Rectangle + Text` constructions

## Where to Modify
- change battle UI or combat interaction → `Game.ts`
- change map movement or encounter triggers → `WorldMap.ts`
- change camp/party composition UI → `Prep.ts`
- change equipment or item interaction → `EquipScreen.ts`
- change upgrade selection UI → `UpgradeTreeScreen.ts`
- change post-battle display → `BattleResults.ts`
- change asset loading → `Preloader.ts`
- change startup flow → `Boot.ts`
- change debug level picker → `DebugLevelSelect.ts`
