# What We Are Building

Browser-based game with a turn-based game on a grid.

## Tech Stack

- TypeScript (Game logic)
- Phaser (rendering only)
- Browser environment

---

## System Structure

- **Central controller — PhaseManager**
  The only place responsible for controlling game flow and Phaser scenes (start/stop).

- **GamePhase = screen + data**
  Each screen corresponds to exactly one `GamePhase`, which contains **all data required for rendering**.

- **Strict transition pipeline**

  ```
  Scene → PhaseManager.transition()
        → resolveTransition() → next GamePhase
        → applyActionSideEffects() → mutate CampaignState
        → syncPhaserScenes() → start scene
  ```

- **Two types of state**
  - `CampaignState` — persistent (progress, HP, items)
  - `BattleState` — battle-only (queue, effects, etc.)

- **Scenes are stateless**
  - read data only from `GamePhase`
  - do not make decisions
  - do not store state between renders

---

### What must NOT be violated

- ❌ **No scene control outside PhaseManager**
  (`this.scene.start/stop/launch` is forbidden)

- ❌ **No skipping the transition pipeline**
  no shortcuts, even for simple cases

- ❌ **No transition logic inside scenes**
  (e.g. `if victory → go somewhere`) — only in `resolveTransition`

- ❌ **No direct data passing between scenes**
  (`scene.start(key, data)` is forbidden) — use `GamePhase` only

- ❌ **No mixing of states**
  - battle data in `CampaignState`
  - campaign data in `BattleState`

- ❌ **No “return” logic via flags**
  only through `returnPhase`

- ❌ **No side effects in resolveTransition**
  - no Phaser
  - no state access
  - must be pure

---

### Core Idea

- **Single source of truth — GamePhase**
- **Single transition controller — PhaseManager**
- **Pure transition logic + isolated side effects**
- **Scenes = rendering + user input only**

## Component Sources by Layer

### 1. Base UI

**Use `src/ui/`**

For buttons, tooltips, panels, and any interactive or visual primitives.
Rule: no game knowledge — only input handling and rendering.

---

### 2. Game-specific visuals

**Use `src/objects/`**

For units, items, effects, and their tooltips.
These components know game data and use `src/ui` internally.

---

### 3. Scenes

**Not a component source**

Scenes only:

- compose `ui + objects`
- pass callbacks (`onClick`)
- trigger `PhaseManager`

No manual UI creation or duplicated patterns.

---

### 4. Styles & constants

- UI styles → `src/ui/theme.ts`
- Game constants → `src/core/Constants.ts`

No colors or sizes inside scenes.

---

### Decision rules

- Reusable & game-agnostic → `src/ui/`
- Tied to game data → `src/objects/`
- Repeated ≥2 times → extract into component
- Depends on `GameState` → not `ui`

---

### Anti-patterns

- Inline `Rectangle + Text` in scenes
- Duplicated hover/click logic
- Hardcoded styles in scenes
- Tooltips without a base class
- UI calling `PhaseManager`

---

### Rule of thumb

- UI behavior → `src/ui/`
- Game representation → `src/objects/`
- Composition & flow → scenes
