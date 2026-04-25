# scenes

## Role

Scenes are the UI orchestration layer of the game. Each scene corresponds to exactly one `GamePhase`, reads all display data from `PhaseManager.getPhase()`, and triggers transitions via `PhaseManager.transition()`. Scenes never manage game state or scene lifecycle directly.

## Responsibilities

- Compose `src/ui/` and `src/objects/` components into full-screen layouts
- Handle user input (clicks, keypresses) and route to `PhaseManager`
- Re-render on `EventBus` state-change events
- Read all display data exclusively from the current `GamePhase` snapshot
- Never write to `GameState` or decide the next phase

## Key Files

- `Boot.ts` — entry point; initializes `PhaseManager` singleton, delegates to Preloader
- `Preloader.ts` — loads sprite sheets and item icons from unit/item definitions
- `MainMenu.ts` — title screen; triggers `new_game` or `debug` transitions
- `Game.ts` — full battle orchestrator: placement phase, turn queue, combat resolution, game-over; reads `enemyGroupId`, `returnPhase`, `isDebug` from phase
- `Prep.ts` — camp screen: unit benching, party panel, enemy group selector; reads `units[]` snapshot
- `EquipScreen.ts` — character detail and equipment management; handles both `equip_screen` and `debug_equip_screen` phases
- `UpgradeTreeScreen.ts` — skill upgrade tree: 4 tiers × 4 options; reads `upgradeTiers[]` snapshot, triggers `choose_upgrade`
- `WorldMap.ts` — overworld grid: party movement, mob encounters, camp/portal interactions; reads `mapId` and `partyPos`
- `MapVictory.ts` — post-map victory screen; transitions to `exit_to_menu`
- `DebugLevelSelect.ts` — debug-only level selector (1–30); triggers `init_debug`

## Structural Role

scenes → UI orchestration + user input routing

## Data Flow

User input (click / keypress)
↓
Scene calls PhaseManager.transition({ type: '...' })
↓
PhaseManager resolves next GamePhase (pure) + applies side effects
↓
PhaseManager starts the correct scene
↓
Scene reads PhaseManager.getPhase() and renders

## Dependencies

- depends on: `src/core/` (PhaseManager, GameState, EventBus, Constants), `src/objects/` (UnitView, CellView, InitiativeBar, etc.), `src/ui/` (Button, theme), `src/data/` (unit/item/map definitions), `src/battle/` (combat logic used by Game.ts)
- used by: nothing — scenes are leaf nodes in the dependency graph

## Invariants

- Scenes never call `this.scene.start/stop/launch` (Boot and Preloader are the only exceptions)
- All display data must come from `PhaseManager.getPhase()`, never from cached local state
- Scenes never call `resolveTransition` or mutate `GameState` directly
- Transition decisions (what comes next) belong in `PhaseManager`, not in scenes
- No data is passed between scenes via `scene.start(key, data)` — use `GamePhase` only

## Where to Modify

- change battle UI or turn flow → `Game.ts`
- change camp/bench layout → `Prep.ts`
- change equipment or backpack layout → `EquipScreen.ts`
- change skill upgrade display → `UpgradeTreeScreen.ts`
- change overworld movement or map rendering → `WorldMap.ts`
- add a new screen → create new scene file + add corresponding `GamePhase` type + wire in `PhaseManager`
- change asset loading → `Preloader.ts`
