# src — Game Source Root

## System Role

Turn-based tactics game built with Phaser. The `src/` tree is divided into domain logic, state orchestration, content data, visual components, and scene composition. Phaser is used for rendering only; all game rules live in pure TypeScript.

## Responsibilities

- Define and enforce turn-based battle rules (battle/)
- Manage all game-phase transitions and persistent state (core/)
- Declare all playable content — units, skills, items, maps (data/)
- Render game-specific visuals as reusable stateless components (objects/)
- Compose screens from components and route user input (scenes/)
- Provide a game-agnostic UI primitive library (ui/)
- Model the overworld grid and handle traversal queries (world/)

## Folder Map

- `battle/`  → pure domain logic: combat, placement, skill targeting, item ops — no Phaser
- `core/`   → state machine, PhaseManager, GameState, layout constants, event bus
- `data/`   → declarative content definitions (units, skills, enemies, maps) — no logic
- `objects/` → game-specific visual components that bridge game data and ui/ primitives
- `scenes/` → one scene per GamePhase; composes objects/ + ui/, calls PhaseManager
- `ui/`     → game-agnostic UI primitives (Button, Tooltip, HpBar) and theme constants
- `world/`  → overworld map types, passability checks, pure query functions

## Architecture Overview

```
scenes/
  ↓  reads GamePhase snapshot, routes input
core/  (PhaseManager + GameState)
  ↓  resolves transitions, applies side effects
battle/          world/
  ↓                ↓
data/  (content consumed by both)
```

scenes/ compose:  objects/  →  ui/

## Data Flow

```
user input (scene)
  ↓
PhaseManager.transition()
  ↓
resolveTransition()  [pure]
  ↓
applyActionSideEffects()  [mutates CampaignState / BattleState]
  ↓
syncPhaserScenes()  →  scene renders GamePhase snapshot
```

## Entry Points

- bootstrap → `src/main.ts` (creates Phaser.Game with config from `src/config.ts`)
- first scene → `src/scenes/Boot.ts` → `src/scenes/Preloader.ts` → `src/scenes/MainMenu.ts`

## Dependencies

- `scenes/` → depends on `core/`, `objects/`, `ui/`
- `objects/` → depends on `ui/`, `core/`, `data/`
- `battle/` → depends on `data/`; no Phaser, no `core/` state
- `ui/` → depends on nothing in `src/` (pure primitives)
- `world/` → depends on `data/`; pure functions only
- `core/` → depends on `battle/`, `world/`, `data/`

## Invariants

- Only `PhaseManager` starts/stops Phaser scenes (except Boot and Preloader)
- `resolveTransition()` is pure — no Phaser calls, no state mutations
- Scenes are stateless: read from `GamePhase`, never store data between renders
- `ui/` has zero knowledge of game rules or GameState
- All pixel values scale through `Constants.LAYOUT_SCALE`
- `battle/` contains no Phaser imports

## Where to Modify

- add/change combat rule        → `src/battle/`
- add/change game phase or flow → `src/core/`
- add unit, skill, item, map    → `src/data/`
- add/change a game visual      → `src/objects/`
- add/change a screen           → `src/scenes/`
- add/change a UI primitive     → `src/ui/`
- change overworld traversal    → `src/world/`
- change global styles/colors   → `src/ui/theme.ts`
- change layout constants       → `src/core/Constants.ts`
