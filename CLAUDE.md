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
        → applyActionSideEffects()          (still owned by PhaseManager until Substage 3C)
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

- `PhaseManager` and `phaseTransitionResolver` must be importable in Node without browser globals. Enforced by a Node smoke test.
- Phase routing lives in `phaseTransitionResolver`: `(current phase, action, derived metadata) → next phase | rejection`.
- `phaseTransitionResolver` must be importable in Node and must not import Phaser, runtime state, RNG, storage, scenes, or mutation handlers.
- The read side of the pipeline has one owner per responsibility: `phaseTransitionMetadata` derives the resolver's stateful facts, `phaseSnapshotRebuilder` dispatches snapshot rebuilding, `battlePhaseSnapshot` composes the battle snapshot, `battleRuntimeAccess` resolves and validates the active battle runtime, and `phaseChangeNotifier` emits the mutation-only refresh. `PhaseManager` coordinates them and implements none of their rules.
- `rebuildPhaseSnapshot`'s switch ends in a `never` assertion, so a new `GamePhase` variant forces an explicit "does this phase carry a snapshot?" decision instead of silently passing through.
- No battle snapshot field aliases runtime-owned mutable state: `participants`, `roundQueue`, `validTargets`, `placementSelection` and every unit's `shape`, `deployment`, `sprite.states`, `skills` array and `activeEffects` (including nested `effect`/`periodicHp`) are copies. The single documented exception is the `ActionSkillDefinition` entries inside `skills` — shared immutable static content from the `SKILLS` registry.
- `PhaseManager` only runs resolver → effects → snapshot → scene sync/notification; it does not inspect action or phase types or access domain state.
- `PhaseManager` dependencies and pipeline behavior are enforced by boundary checks and coordinator contract tests.
- Orchestration boundary rules (`scripts/orchestration-boundary-rules.mjs`) are shared, pure-data, and imported by both `scripts/check-boundaries.mjs` and its tests — no duplicated policy literals, including the real `scenes/**` policy (`SCENES_IMPORT_POLICY`).
- Every phase handler under `src/core/phaseHandlers/` (any nesting, `.ts` or `.tsx`) requires exactly one of an explicit `PHASE_HANDLER_IMPORT_POLICIES` entry or a reasoned, non-duplicated coverage exclusion; a new handler file without one, or with both, fails `check-boundaries.mjs`.
- Scenes (including `scenes/controllers/**`) may not import state stores (`GameState`, `DebugBattleState`, `playerSessionStore`), lifecycle owners (`debugLifecycle`), phase handlers and pipeline internals (`phaseActionEffects`/`phaseTransitionMetadata`/`phaseSnapshotRebuilder`/`phaseTransitionResolver`/`phaseChangeNotifier`/`phaseEffectsResult`), battle runtime or its access seam (`battleRuntimeContext`, `battleRuntimeAccess`), or any module that builds the committed `GamePhase` snapshot from authoritative state, including its internal helpers (`battlePhaseSnapshot`, `battleSnapshotBuilder`, `battleResultsSnapshot`, `equipmentScreenSnapshot`, `unitStatsSnapshot`, `rosterCampSnapshot`, `upgradeTreeSnapshot`, `worldMapProjection`) — not even type-only. Scenes render the committed `GamePhase`; they never resolve runtime and never rebuild the snapshot themselves. Scene-facing **presentation adapters** are a distinct category and stay importable: `battleDirectiveProjection` and `battleSkillPreviewProjection` derive transient presentation models only from committed `GamePhase` data or call-scoped transition feedback. The snapshot *types* scenes consume live in `shared/battleSnapshots.ts` and stay importable too.
- The public transition contracts scenes *may* import are `phaseTransitionResult` and `battleActionFeedback`. `battleActionFeedback` is presentation/control output, never render state and never authoritative state: it shares no object reference with `BattleState`, `TurnContext`, or `BattleRuntimeContext` at any depth, and its narrowed DTOs deliberately drop the internal directive's `activeSkill` and `validTargets` (the latter aliases `BattleState.validTargets`) and the auto-turn intention's action payload.
- `battleActionFeedback`, `phaseTransitionResult` and `phaseEffectsResult` each carry a tiny fail-closed import allowlist (`TRANSITION_CONTRACT_IMPORT_POLICIES`), pinned exactly by `tests/scripts/boundaryPolicy.test.ts` — a contract module can never acquire a stateful dependency without a visible test change.
- Gameplay Phaser scene control (`start`/`stop`/`launch`/...) is confined to `scenes/phaserSceneSynchronizer.ts` (any target, since it resolves keys from a compile-time-exhaustive phase→scene map), plus exactly two named bootstrap edges: `Boot.ts` → `this.scene.start("Preloader")` and `Preloader.ts` → `this.scene.start("MainMenu")`, each permitted at most once. Every other file, and any other call in those two files, is scanned (dotted and element-access forms, direct and one-level lexically-scoped aliases) and rejected by `scripts/scene-control-policy.mjs`.
- Phaser scene transitions never carry gameplay data — enforced by the argument-count rules in the same scanner.
- These rules describe the target dependency shape ahead of the full `PhaseManager` decomposition — not a claim the codebase satisfies them everywhere yet. Known, tracked violations surfaced by `check-boundaries.mjs` are not accepted architecture.

---

Use node scripts/check-boundaries.mjs 2>&1 to check boundaries.

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
