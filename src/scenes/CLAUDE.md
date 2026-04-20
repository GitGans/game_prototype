# scenes

## Role
Orchestration layer that wires game flow together. Scenes manage the Phaser lifecycle, respond to user input by calling `PhaseManager.transition()`, and render state read from `PhaseManager.getPhase()`. This is the only layer that imports from all other layers.

## Responsibilities
- Manage Phaser scene lifecycle (create, update, destroy)
- Wire user input events to `PhaseManager.transition()` calls
- Read display data from `PhaseManager.getPhase()` and delegate rendering to `src/objects/`
- Load all assets at startup (sprites, item icons)
- Coordinate battle flow: placement → turns → targeting → combat resolution → game-over
- Bridge the world map exploration loop with battle and camp phases

## Key Files
- `Boot.ts` — first scene; initializes PhaseManager and hands off to Preloader
- `Preloader.ts` — loads all sprite sheets and item icons; starts MainMenu when done
- `MainMenu.ts` — title screen; entry point for new game and debug battle flows
- `Game.ts` — full battle orchestrator: placement, initiative, turns, combat, game-over detection
- `Prep.ts` — pre-battle camp screen: unit benching, enemy group selection, equip access
- `EquipScreen.ts` — equipment management: equip/unequip items, browse backpack, view unit stats
- `WorldMap.ts` — overworld grid: party movement, mob encounters, portal and NPC interactions
- `MapVictory.ts` — post-battle victory screen; exits to MainMenu

## Structural Role
scenes → sole orchestration layer; reads phases, calls transitions, renders via objects/

## Data Flow
User input (click / keypress)
↓
Scene calls PhaseManager.transition(action)
↓
PhaseManager resolves next GamePhase and mutates GameState
↓
PhaseManager.syncPhaserScenes() starts the correct scene
↓
New scene reads PhaseManager.getPhase() and renders state

## Dependencies
- depends on: `core/PhaseManager`, `core/GameState`, `core/EventBus`, `core/Constants`, `battle/*`, `data/*`, `objects/*`, `world/*`
- used by: `src/config.ts` (scene registry), `src/main.ts` (game bootstrap)

## Invariants
- Scenes MUST NOT call `this.scene.start()`, `this.scene.launch()`, or `this.scene.stop()` directly (Boot and Preloader are exempt)
- Scenes MUST NOT decide what the next phase is — that belongs to `resolveTransition()` in PhaseManager
- Scenes MUST NOT write to `GameState` directly from UI components — mutations go through `PhaseManager.transition()`
- All display data must be read from `PhaseManager.getPhase()` in `create()`, not stored in local scene fields from prior phases
- `src/objects/` components used here are read-only — they never mutate GameState

## Where to Modify
- change battle flow or game-over logic → `Game.ts`
- change prep/camp screen (benching, enemy selector) → `Prep.ts`
- change equipment UI or item use → `EquipScreen.ts`
- change world map movement or encounter triggers → `WorldMap.ts`
- change title screen or game entry → `MainMenu.ts`
- add a new sprite or item icon → `Preloader.ts` + `public/assets/sprites/`
- add a new game screen → `src/core/phases.ts` → `PhaseManager.ts` → new scene here → `src/config.ts`
