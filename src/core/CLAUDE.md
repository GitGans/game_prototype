# core/

## Role

Infrastructure layer of the game. Provides shared configuration, global state management, and cross-system communication. No domain logic lives here.

---

## Responsibilities

- Define layout and visual constants used across all UI components
- Hold all runtime and persistent game state in one place
- Broadcast state change events without tight coupling between systems
- Persist cross-battle data (unit levels, item state, placements)
- Initialize item containers once on game start

---

## Key Files

| File           | Purpose                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `Constants.ts` | Layout scale, cell/grid sizes, color palette, gameplay scalar values   |
| `GameState.ts` | Singleton state manager — battle state + persistent cross-battle data  |
| `EventBus.ts`  | Singleton Phaser EventEmitter + `Events` enum for event name constants |

### Constants.ts

- Layout: `LAYOUT_SCALE`, `CELL_SIZE`, `CELL_GAP`, `GRID_COLS`, `GRID_ROWS`, `SIDE_GAP`, `BENCH_PANEL_WIDTH`, `BENCH_GAP`, `BENCH_SLOTS`
- Visual: `COLORS`
- Gameplay: `DAMAGE`, `HEAL_AMOUNT`

### GameState.ts

- `get()` / `set()` / `reset()` / `setPhase()` — battle state access
- `getBattleMode()` / `setBattleMode()` — manual / auto / quick
- `initItemsIfNeeded()` — one-time item container setup (called in MainMenu)
- Persistent fields: `playerUnitLevels`, `playerUnitPlacements`, `playerBenchIds`, `campUnitIds`, `itemInstances`, `itemContainers`, `lastEnemyRace`

### EventBus.ts

- `EventBus` — singleton emitter
- `Events.STATE_CHANGED` — fired after each state mutation

---

## Structural Role

```
core/ → shared infrastructure (constants, state, events)
```

---

## Data Flow

```
Game/Prep scenes write state
↓
GameState.set() / setPhase()
↓
EventBus emits STATE_CHANGED
↓
UI components re-render using Constants for sizing/colors
```

---

## Key Dependencies

**core/ depends on:**

- `battle/types.ts` — type definitions used in GameState

**Depends on core/:**

- All scenes (`Boot`, `Preloader`, `MainMenu`, `Prep`, `Game`)
- All UI objects (`CellView`, `UnitView`, `InitiativeBar`, `BattleLog`)
- `battle/autoPlace.ts` — reads Constants for layout

---

## Critical Invariants

- `GameState` is a singleton — never instantiate a second one
- `reset()` must preserve all persistent fields (`playerUnitLevels`, items, placements, etc.)
- `initItemsIfNeeded()` must remain idempotent — safe to call multiple times
- `CELL_SIZE` and layout constants must stay consistent between rendering and logic layers
- `Events.STATE_CHANGED` is the only event channel — do not add ad-hoc string events

---

## Where to Modify

| What to change                   | File                                   |
| -------------------------------- | -------------------------------------- |
| Cell/grid dimensions             | `Constants.ts`                         |
| Color palette                    | `Constants.ts`                         |
| Base damage or heal values       | `Constants.ts`                         |
| Add/remove battle state fields   | `GameState.ts`                         |
| Add persistent cross-battle data | `GameState.ts`                         |
| Change battle mode options       | `GameState.ts`                         |
| Item initialization logic        | `GameState.ts` → `initItemsIfNeeded()` |
| Add new global events            | `EventBus.ts` → `Events` object        |
