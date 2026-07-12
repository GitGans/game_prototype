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
- `Game.ts` — battle scene shell; creates grid/unit views, wires battle controllers, routes pointer input, refreshes views from `GamePhase`, and constructs the battle-end overlay. Battle logic lives in the three controllers below.
- `controllers/BattlePlacementController.ts` — placement UI, bench cards, drag/swap interaction; dispatches placement actions to `PhaseManager`
- `controllers/BattleTurnFlowController.ts` — turn sequencing, battle control buttons, timers, quick battle, skip/charge flow, manual target confirmation, skill-bar flow; dispatches battle actions to `PhaseManager`
- `controllers/BattlePresentationController.ts` — applies battle event, directive, and skill-preview presentations to Phaser objects
- `WorldMap.ts` — keyboard-driven map navigation; triggers encounters, camps, and portals
- `Prep.ts` — pre-battle camp screen; manages party composition and equipment access
- `EquipScreen.ts` — unit equipment and item management; click-to-equip (equipment + usable) / unequip; no item-use in this stage
- `UpgradeTreeScreen.ts` — upgrade tier selection per unit
- `BattleResults.ts` — post-battle summary and level-up display
- `DebugLevelSelect.ts` — developer tool for picking a battle level directly
- `MapVictory.ts` — map completion celebration; routes back to main menu

## Battle Scene Architecture

`Game.ts` is a thin Phaser shell. It owns:
- Phaser scene lifecycle
- controller construction and wiring
- grid and unit view creation / destruction
- high-level pointer routing to the correct controller
- view refresh from `GamePhase` snapshot fields
- battle-end overlay construction (overlay receives callbacks; it does not call `PhaseManager`)

`Game.ts` does **not** own: battle rules, state mutations, turn sequencing, timers, control buttons, display formatting, or placement logic.

Scenes and scene controllers dispatch intent to `PhaseManager`; they do not mutate battle state directly.

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
- Scenes may compose screens; scenes must not define reusable UI behavior or visual style
- Use objects/ widgets/panels for any interactive UI with visual state
- Use `UI_THEME` / domain visual themes for colors; do not introduce local style literals
- New repeated UI must not be implemented as inline `Rectangle + Text` — extract to `src/ui/` or `src/objects/`
- Repeated visual pattern (≥2 scenes) → extract to `src/objects/` before the second use
- Note: `Boot.ts` and `Preloader.ts` use direct `scene.start()` for bootstrap only. All gameplay scene transitions go through PhaseManager.

## Where to Modify
- change battle scene wiring, grid layout, or unit view lifecycle → `Game.ts`
- change placement drag/swap interaction or bench cards → `controllers/BattlePlacementController.ts`
- change turn sequencing, battle controls, timers, or skill-bar flow → `controllers/BattleTurnFlowController.ts`
- change battle event / directive / skill-preview presentation application → `controllers/BattlePresentationController.ts`
- change battle display text formatting or visual computation → `src/objects/*Presentation.ts`
- change battle rules or state transitions → `src/battle/` and `src/core/phaseHandlers/battlePhaseHandler.ts`
- change map movement or encounter triggers → `WorldMap.ts`
- change camp/party composition UI → `Prep.ts`
- change equipment or item interaction → `EquipScreen.ts`
- change upgrade selection UI → `UpgradeTreeScreen.ts`
- change post-battle display → `BattleResults.ts`
- change asset loading → `Preloader.ts`
- change startup flow → `Boot.ts`
- change debug level picker → `DebugLevelSelect.ts`
