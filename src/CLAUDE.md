# src/

## Purpose

Root of all game source code. Connects the entry point, configuration, static data, pure domain logic, scene orchestration, and UI rendering into one working system.

---

## Entry Points

| File        | Role                                                   |
| ----------- | ------------------------------------------------------ |
| `main.ts`   | Creates the Phaser.Game instance with config           |
| `config.ts` | Phaser config: window size, pixel art mode, scene list |

---

## System Architecture

| Layer          | Folder     | Role                                                 |
| -------------- | ---------- | ---------------------------------------------------- |
| Types & logic  | `battle/`  | Pure TypeScript domain logic — no Phaser             |
| Infrastructure | `core/`    | Shared constants, global state, event bus            |
| Static content | `data/`    | Unit, item, and skill definitions (no runtime logic) |
| Orchestration  | `scenes/`  | Scene lifecycle, game flow, wiring of all layers     |
| Rendering      | `objects/` | Phaser display components — view only                |

---

## Main Folders

### `battle/`

Core domain logic. Placement, targeting, combat, skills, initiative, items.
**Use when:** changing game rules, formulas, or turn mechanics.

### `core/`

Shared infrastructure. Layout constants, singleton state, event bus.
**Use when:** changing global constants, state persistence, or event channels.

### `data/`

Static definitions. Unit blueprints, item stats, skill patterns.
**Use when:** adding/editing units, items, or skills.

### `scenes/`

Orchestration. Scene transitions, UI wiring, battle loop.
**Use when:** changing game flow, prep UI, placement phase, or game-over handling.

### `objects/`

Phaser UI components. Cell views, unit views, initiative bar, battle log.
**Use when:** changing how something looks or is displayed.

---

## Navigation Guide

| What to change                      | Where to go                                           |
| ----------------------------------- | ----------------------------------------------------- |
| Game rules, damage formulas         | `battle/combat.ts`, `battle/targeting.ts`             |
| Skill AoE patterns                  | `battle/skillPatterns.ts`, `data/skillDefinitions.ts` |
| Unit stats or starting lineup       | `data/unitDefinitions.ts`                             |
| Item stats or equip slots           | `data/itemDefinitions.ts`                             |
| Item equip/unequip logic            | `battle/itemOps.ts`                                   |
| Turn order logic                    | `battle/initiative.ts`                                |
| Unit placement rules                | `battle/placement.ts`                                 |
| Level scaling formula               | `battle/autoPlace.ts`                                 |
| Grid/cell dimensions, colors        | `core/Constants.ts`                                   |
| State persistence across battles    | `core/GameState.ts`                                   |
| Pre-battle UI (camp, equipment)     | `scenes/Prep.ts`                                      |
| Battle UI (bench, turns, game over) | `scenes/Game.ts`                                      |
| Cell highlight / AoE preview        | `objects/CellView.ts`                                 |
| Unit HP display, sprite states      | `objects/UnitView.ts`                                 |
| Turn order display                  | `objects/InitiativeBar.ts`                            |
| Battle event log                    | `objects/BattleLog.ts`                                |
| Asset loading                       | `scenes/Preloader.ts`                                 |

---

## Typical Tasks → Entry Points

| Task                                 | File                                                       |
| ------------------------------------ | ---------------------------------------------------------- |
| Add a new player unit                | `data/unitDefinitions.ts`                                  |
| Add a new enemy race                 | `data/unitDefinitions.ts` → `ENEMY_UNITS`                  |
| Add a new item                       | `data/itemDefinitions.ts`                                  |
| Add a new skill                      | `data/skillDefinitions.ts` + `battle/skillPatterns.ts`     |
| Change defense or damage calculation | `battle/combat.ts`                                         |
| Change targeting rules               | `battle/targeting.ts`                                      |
| Add a new battle mode                | `battle/types.ts` + `core/GameState.ts` + `scenes/Game.ts` |
| Change equipment UI                  | `scenes/Prep.ts`                                           |
| Add a new persistent field           | `core/GameState.ts`                                        |
| Add a new sprite                     | `scenes/Preloader.ts` + unit/item definition               |

---

## Structural Role

```
src/ → root source layer connecting all five subsystems
```

---

## Data Flow

```
Static definitions (data/)
↓
Asset loading (scenes/Preloader.ts)
↓
State initialized (core/GameState, scenes/MainMenu)
↓
Player configures units/items (scenes/Prep)
↓
Battle initialized — units instantiated, placed (battle/autoPlace, placement)
↓
Turn loop: targeting → skill resolution → combat (battle/*)
↓
State mutated → EventBus → UI refreshed (core/EventBus, objects/*)
↓
Game over → persist results to GameState → return to Prep
```

---

## Dependency Rules

- `battle/` → no Phaser, no scenes, no objects
- `core/` → no Phaser scenes, no battle logic
- `data/` → no runtime logic, no imports from other src folders (except `battle/types.ts` and `battle/skillPatterns.ts`)
- `objects/` → reads state only, never mutates it
- `scenes/` → may import from all layers; is the only layer that wires them together

---

## Critical System Invariants

- `battle/` must remain zero-Phaser — pure TypeScript only
- `objects/` must never write to `GameState` — read-only view layer
- `GameState.reset()` must preserve all persistent fields (levels, items, placements)
- `GameState.initItemsIfNeeded()` must be called before `Prep` loads
- All state mutations in `scenes/Game.ts` must call `GameState.set()` and emit `STATE_CHANGED`
