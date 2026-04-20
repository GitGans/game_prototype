# core

## Role
Shared infrastructure layer. Provides layout constants, singleton state, event communication, and game flow orchestration. Pure TypeScript — no Phaser rendering.

## Responsibilities
- Define layout and color constants used across rendering layers
- Hold all persistent and battle-only game state in a single singleton
- Broadcast state changes to UI via a decoupled event bus
- Own all game phase transitions and Phaser scene lifecycle
- Type all phases and player actions in one place

## Key Files
- `Constants.ts` — grid sizes, spacing, colors, base damage/heal values
- `EventBus.ts` — singleton Phaser EventEmitter; `Events.STATE_CHANGED` is the primary channel
- `GameState.ts` — singleton holding all persistent fields (levels, items, money, placements) and current battle state; `get()` / `set()` / `reset()`
- `PhaseManager.ts` — sole orchestrator of game flow; `transition(action)` is the only mutation point for phases and campaign state
- `phases.ts` — `GamePhase` union (all screens) and `PhaseAction` union (all user/system actions)

## Structural Role
`core` → shared infrastructure consumed by every other layer

## Data Flow
Scene dispatches `PhaseAction`
↓
`PhaseManager.transition(action)`
↓
`resolveTransition` computes next `GamePhase` (pure, no side effects)
↓
`applyActionSideEffects` mutates `GameState`
↓
`rebuildSnapshot` recomputes phase data (backpack, equipment snapshots)
↓
`syncPhaserScenes` starts correct scene — OR — emits `STATE_CHANGED`
↓
UI (`objects/`) reacts to event, re-renders from state

## Dependencies
- depends on: `src/battle/types.ts` (unit/item types), `src/data/` (unit and map definitions for side effects)
- used by: `src/scenes/` (dispatches actions, reads phase), `src/objects/` (listens to EventBus), `src/battle/` (reads constants)

## Invariants
- `GameState.reset()` must preserve all persistent fields: levels, items, placements, bench, camp, money, permanent bonuses
- `resolveTransition` is a pure function — zero Phaser imports, zero GameState access
- No scene files call `this.scene.start()` — only `PhaseManager.syncPhaserScenes()` does
- All `GameState` mutations from phase transitions happen inside `applyActionSideEffects`, not in scenes
- `src/core/` must never import Phaser scene classes or battle logic

## Where to Modify
- change grid size or colors → `Constants.ts`
- add a new game screen or phase → `phases.ts` (add `GamePhase` variant) → `PhaseManager.ts` (transition, side effects, scene sync)
- add persistent state field → `GameState.ts` (`CampaignState` interface + `reset()` preservation)
- add a new player action → `phases.ts` (`PhaseAction` union) → `PhaseManager.ts` (`resolveTransition` + `applyActionSideEffects`)
- change event channels → `EventBus.ts`
