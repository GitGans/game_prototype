# What We Are Building

Browser-based game with a turn-based battle system on a grid. The project root connects static assets, source code, and build configuration into one deployable browser game.

## Tech Stack

- TypeScript (Game logic)
- Phaser (rendering only)
- Browser environment

---

## Entry Points

| File            | Role                                                   |
| --------------- | ------------------------------------------------------ |
| `src/main.ts`   | Creates the Phaser.Game instance                       |
| `src/config.ts` | Phaser config: window size, pixel art mode, scene list |
| `public/`       | Static assets served directly (sprite sheets)          |

---

## System Architecture

| Layer          | Location                 | Role                                                       |
| -------------- | ------------------------ | ---------------------------------------------------------- |
| Domain logic   | `src/battle/`            | Pure TypeScript — placement, combat, skills, items, turns  |
| Infrastructure | `src/core/`              | Constants, singleton state, event bus                      |
| Static content | `src/data/`              | Unit, item, and skill definitions                          |
| Orchestration  | `src/scenes/`            | Scene lifecycle, game flow, UI wiring                      |
| Rendering      | `src/objects/`           | Phaser display components (view only)                      |
| Assets         | `public/assets/sprites/` | PNG sprite sheets (100×100 px per frame, horizontal strip) |

---

## Main Folders

### `src/battle/`

Core game rules. Placement validation, targeting, combat resolution, skill patterns, initiative, item operations.
**Use when:** changing game mechanics, formulas, or turn structure.

### `src/core/`

Shared infrastructure. Layout constants, global state singleton, event bus.
**Use when:** changing persistent state, layout constants, or event channels.

### `src/data/`

Static definitions only. Unit blueprints, item stats, skill references.
**Use when:** adding or editing units, items, or skills.

### `src/scenes/`

Game flow and wiring. Scene transitions, placement phase, battle loop, prep UI.
**Use when:** changing scene flow, battle UI, or pre-battle configuration.

### `src/objects/`

Phaser UI components. Cell views, unit views, initiative bar, battle log.
**Use when:** changing how the battle field or units look.

### `public/assets/sprites/`

Sprite sheet images for units.
**Use when:** adding or replacing unit sprite art.

---

## Navigation Guide

| What to change                       | Where to go                                                    |
| ------------------------------------ | -------------------------------------------------------------- |
| Add a player or enemy unit           | `src/data/unitDefinitions.ts`                                  |
| Add an item                          | `src/data/itemDefinitions.ts`                                  |
| Add a skill or AoE pattern           | `src/data/skillDefinitions.ts` + `src/battle/skillPatterns.ts` |
| Change damage or defense formula     | `src/battle/combat.ts`                                         |
| Change targeting rules               | `src/battle/targeting.ts`                                      |
| Change level scaling                 | `src/battle/autoPlace.ts`                                      |
| Change item equip/unequip logic      | `src/battle/itemOps.ts`                                        |
| Change turn order                    | `src/battle/initiative.ts`                                     |
| Change grid/cell sizes or colors     | `src/core/Constants.ts`                                        |
| Add persistent state                 | `src/core/GameState.ts`                                        |
| Change prep screen (camp, equipment) | `src/scenes/Prep.ts`                                           |
| Change battle flow or game-over      | `src/scenes/Game.ts`                                           |
| Add a new sprite asset               | `public/assets/sprites/units/` + `src/scenes/Preloader.ts`     |
| Change cell highlight or AoE preview | `src/objects/CellView.ts`                                      |
| Change unit HP or death visuals      | `src/objects/UnitView.ts`                                      |
| Add a new game screen / phase        | `src/core/phases.ts` → `src/core/PhaseManager.ts` → new scene in `src/scenes/` |
| Add a new enemy group for the map    | `src/data/enemyGroupDefinitions.ts`                            |
| Add or edit a submap                 | `src/data/mapDefinitions.ts`                                   |
| Change movement / cell resolution    | `src/world/mapLogic.ts`                                        |
| Change world map rendering           | `src/scenes/WorldMap.ts`                                       |

---

## Typical Tasks → Entry Points

| Task                    | File                                                                   |
| ----------------------- | ---------------------------------------------------------------------- |
| New player unit         | `src/data/unitDefinitions.ts` → `PLAYER_UNITS`                         |
| New enemy race          | `src/data/unitDefinitions.ts` → `ENEMY_UNITS`                          |
| New item                | `src/data/itemDefinitions.ts`                                          |
| New skill               | `src/data/skillDefinitions.ts` + `src/battle/skillPatterns.ts`         |
| New battle mode         | `src/battle/types.ts` + `src/core/GameState.ts` + `src/scenes/Game.ts` |
| New equipment slot type | `src/battle/types.ts` + `src/battle/itemOps.ts`                        |
| New sprite sheet        | `public/assets/sprites/units/` + `src/scenes/Preloader.ts`             |

---

## Structural Role

```
project root → connects assets, source layers, and build config into a browser game
```

---

## Data Flow

```
Static definitions (src/data/)
↓
Assets loaded at startup (src/scenes/Preloader.ts)
↓
State initialized — items created once (src/core/GameState, src/scenes/MainMenu)
↓
Player configures party (src/scenes/Prep → src/battle/itemOps)
↓
Battle starts — units instantiated and placed (src/battle/autoPlace, placement)
↓
Turn loop: targeting → pattern resolution → combat (src/battle/*)
↓
State change → EventBus → UI refresh (src/core/EventBus, src/objects/*)
↓
Game over → results persisted → return to Prep or restart
```

---

## Dependency Rules

- `src/battle/` → no Phaser imports allowed
- `src/objects/` → reads state only, never mutates `GameState`
- `src/data/` → no runtime logic; may only import types from `src/battle/types.ts`
- `src/scenes/` → sole layer that imports from all other layers and wires them together
- `src/core/` → no Phaser scene imports, no battle logic

---

## Phase System — Architecture Rules

The game flow is controlled by a single `PhaseManager` (`src/core/PhaseManager.ts`).
`PhaseManager` is the **sole owner** of all scene transitions.

### Allowed data flow for user interactions

```
User clicks / moves
  → Scene calls PhaseManager.transition(action)
    → resolveTransition() computes next GamePhase (pure function, no Phaser, no GameState)
      → applyActionSideEffects() runs GameState mutations for this transition
        → syncPhaserScenes() calls scene.start()
          → New scene reads PhaseManager.getPhase() and renders it
```

### Scenes MUST

- Read display data from `PhaseManager.getPhase()` in `create()`
- On user input: call `PhaseManager.transition(action)` only

### Scenes MUST NOT

- Call `this.scene.start()`, `this.scene.launch()`, or `this.scene.stop()` directly
- Decide what the next phase or screen is
- Store "where we came from" in local fields or temporary GameState flags

### PhaseManager responsibilities

- Owns the current `GamePhase` value
- `transition(action)` is the only mutation point
- `resolveTransition(phase, action): GamePhase` — exported pure function, no Phaser, no GameState
- `applyActionSideEffects()` — all GameState mutations triggered by transitions, called inside `transition()`
- `syncPhaserScenes(phase)` — the only place `scene.start()` appears

### Invariants — violations are architecture bugs

- **No `this.scene.start` in scene files.** Grep: `this\.scene\.(start|launch|stop)` must return zero matches in `src/scenes/` (Boot.ts and Preloader.ts are exempt).
- **`resolveTransition` has zero Phaser imports and zero GameState access.** Pure TypeScript.
- **Dialogs, cutscenes, shops = future phases** with a `returnPhase` field. Never hardcoded scene names.

### Adding a new game screen — checklist

1. Add a variant to the `GamePhase` union in `src/core/phases.ts`
2. Add transition cases in `resolveTransition()` in `PhaseManager.ts`
3. Add side effects (if any) in `applyActionSideEffects()`
4. Add a `case` in `syncPhaserScenes()` to start the correct Phaser scene
5. Create the Phaser scene — reads phase, renders, calls `transition()`
6. Register the scene in `src/config.ts`

---

## Critical System Invariants

- Game logic and rendering are fully separated: `src/battle/` must remain zero-Phaser
- `GameState.reset()` must preserve all persistent fields (levels, items, placements, bench)
- `GameState.initItemsIfNeeded()` must be called before `Prep` scene loads
- All `BattleState` mutations in `Game.ts` must call `GameState.set()` and emit `STATE_CHANGED`
- All UI in `src/objects/` is read-only — never writes to `GameState`

---

## Core Principles

1. Game logic fully separated from rendering — Phaser handles visuals only.
2. The battle system is cell-based, not unit-based.
3. All names and interface in the game are in English only.
