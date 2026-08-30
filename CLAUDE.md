# What We Are Building

Browser-based game with a turn-based game on a grid.

## Tech Stack

- TypeScript (Game logic)
- Phaser (rendering only)
- Browser environment

---

## System Structure

- **Flow coordinator — PhaseManager**
  Owns the gameplay transition pipeline and requests scene synchronization through `PhaseSceneSynchronizer`.

- **GamePhase = screen + data**
  Each screen corresponds to exactly one `GamePhase`, which contains **all data required for rendering**.

- **Strict transition pipeline**

  ```
  Scene → PhaseManager.transition()
        → derivePhaseTransitionMetadata() → resolveTransition() → next GamePhase
        → phaseActionEffects.apply()        (all mutation, lifecycle sequencing and
                                             battle-runtime teardown)
        → rebuildPhaseSnapshot()
        → PhaseSceneSynchronizer.sync() / notifyPhaseChanged()
        → returns PhaseTransitionResult
  ```

  `transition()` returns a synchronous, call-scoped `PhaseTransitionResult`:
  `{ status: "rejected" }` or `{ status: "applied", battleFeedback }`. It reports
  acceptance and transient battle feedback only — no `GamePhase` (render state comes
  from `getPhase()`) and no navigation/mutation classification (routing belongs to
  `resolveTransition`). Battle feedback belongs to the invocation that produced it;
  a later action can never observe an earlier action's feedback.

- **Two types of state**
  - `CampaignState` — persistent (progress, HP, items)
  - `BattleState` — battle-only (queue, effects, etc.)

- **Scenes are stateless**
  - read data only from `GamePhase`
  - do not make decisions
  - do not store state between renders

---

### What must NOT be violated

- ❌ **No direct gameplay scene control outside `PhaserSceneSynchronizer`**
  Scenes route navigation through `PhaseManager.transition()`; direct scene control is allowed only during Boot/Preloader bootstrap.

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

### Enforced architecture boundaries

- `core/**` must not import Phaser. `PhaseManager` and `phaseTransitionResolver` must remain importable in Node without browser globals.
- `PhaseManager` only coordinates: metadata → routing → effects → snapshot rebuild → scene sync/notification. Rejected transitions produce no effects.
- `phaseTransitionResolver` is pure: it receives the current phase, action, and derived metadata, and returns the next phase or rejection. It must not access state, RNG, storage, scenes, Phaser, or mutation modules.
- Routing, metadata derivation, lifecycle/effects, and snapshot projection have separate owners. Coordinators and facades must not absorb domain rules.
- Scenes render committed `GamePhase` data and dispatch actions through `PhaseManager`. Gameplay scene control belongs only to the Phaser scene synchronizer, except for explicit bootstrap transitions.
- Battle runtime writes belong only to its lifecycle owner; reads use the validated read-only gateway. Render snapshots must not share mutable runtime-owned data.
- Boundary failures must be fixed or resolved through an explicit architectural policy change. Never accept them as a new baseline.

Verify with:

```bash
npm test
node scripts/check-boundaries.mjs
```

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

- Generic UI styles → `src/ui/theme.ts` (via `UI_THEME`):
  fonts, alpha states, depth layers, semantic value colors, screen backgrounds,
  component tokens (button / tooltip / panel / overlay / contextMenu / numberInput)
- Game-domain visual tokens → `src/objects/*VisualTheme.ts`:
  - `battleVisualTheme.ts` — cells, units, bench, skills, upgrade cards, portraits
  - `worldMapVisualTheme.ts` — map cell palette
  - `itemVisualTheme.ts` — item cell and equipment slot colors
  - `prepVisualTheme.ts` — prep-screen action tile colors
- Game constants → `src/core/Constants.ts`

**Isolation rule:** `*VisualTheme.ts` files must NOT import from `ui/theme`.
They define raw hex tokens only. Enforced by `scripts/check-boundaries.mjs`.

No colors or sizes inside scenes or components directly.

---

### Decision rules

- Reusable & game-agnostic → `src/ui/`
- Tied to game data → `src/objects/`
- Repeated ≥2 times → extract into component
- Depends on `GameState` → not `ui`
- Game-specific hex colors → `src/objects/*VisualTheme.ts` (not `ui/theme`)

---

### Anti-patterns

- Inline `Rectangle + Text` in scenes
- Duplicated hover/click logic
- Hardcoded styles in scenes
- Tooltips without a base class
- UI calling `PhaseManager`
- Game-specific colors inside `ui/theme.ts`
- `*VisualTheme.ts` file importing from `ui/theme`

---

### Rule of thumb

- UI behavior → `src/ui/`
- Game representation → `src/objects/`
- Composition & flow → scenes
