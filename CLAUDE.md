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

- `PhaseManager` and `phaseTransitionResolver` must be importable in Node without browser globals. Enforced by a Node smoke test.
- Phase routing lives in `phaseTransitionResolver`: `(current phase, action, derived metadata) → next phase | rejection`.
- `phaseTransitionResolver` must be importable in Node and must not import Phaser, runtime state, RNG, storage, scenes, or mutation handlers.
- The read side of the pipeline has one owner per responsibility: `phaseTransitionMetadata` derives the resolver's stateful facts, `phaseSnapshotRebuilder` dispatches snapshot rebuilding, `battlePhaseSnapshot` composes the battle snapshot, `battleRuntimeAccess` resolves and validates the active battle runtime out of `battleRuntimeStorage`, and `phaseChangeNotifier` emits the mutation-only refresh. `PhaseManager` coordinates them and implements none of their rules.
- `rebuildPhaseSnapshot`'s switch ends in a `never` assertion, so a new `GamePhase` variant forces an explicit "does this phase carry a snapshot?" decision instead of silently passing through.
- No battle snapshot field aliases runtime-owned mutable state: `participants`, `roundQueue`, `validTargets`, `placementSelection` and every unit's `shape`, `deployment`, `sprite.states`, `skills` array and `activeEffects` (including nested `effect`/`periodicHp`) are copies. The single documented exception is the `ActionSkillDefinition` entries inside `skills` — shared immutable static content from the `SKILLS` registry.
- **Battle runtime ownership is split three ways (Stage 4B).** `battleRuntimeStorage` owns the single nullable reference to the active attempt and holds no rules at all. `battleRuntimeAccess` is the only production read path: it validates initialization *and* `sessionSource` — there is no unvalidated getter anywhere. `battleRuntimeWriteAccess` is the write capability, exposing complete install and idempotent clear only; no partial runtime setter exists. `GameState` owns campaign and debug containers **only**, and both its stored fields (`GAME_STATE_FIELDS`) and its public surface (`GAME_STATE_PUBLIC_API`) are closed policies checked against the real source — a field allowlist alone would miss a capability re-exposed as a public accessor over module-local storage.
- **Importing `battleRuntimeWriteAccess` IS the authority to replace or dispose a battle attempt**, so exactly one production module may do so: `battlePhaseEffects`. This is enforced in the *importer* direction (`RESTRICTED_IMPORT_TARGETS`), which an outbound allowlist cannot express, and storage itself is reachable in production only from its two gateways. The registry compiles fail-closed and validates its own key format: an extension-bearing target key would match no normalized specifier and silently stop restricting, so it is rejected outright, and any malformed entry disables the entire compilation rather than leaving a partially active policy. Tests may import storage directly, and only for fixtures, cleanup, observation and deliberately corrupted runtimes.
- **Authority is closed in both directions: who may pick it up, and what they may hand on.** The importer direction alone leaves a forwarding gap — `battleRuntimeAccess` may legitimately import storage, so `export { writeBattleRuntimeSlot } from './battleRuntimeStorage'` would hand the write capability to every importer of the *read* gateway while the import checker stays green. So the four modules holding restricted authority — `battleRuntimeStorage`, `battleRuntimeAccess`, `battleRuntimeWriteAccess`, `battlePhaseEffects` — have **exact reviewed public export surfaces** (`RUNTIME_OWNERSHIP_EXPORT_POLICIES`), checked against the real source by `scripts/module-export-policy.mjs`. Only named exported functions **with a body** and named type aliases are approvable; every other top-level export form is rejected outright rather than analysed — `export … from`, an alias wearing an approved name, `export *`, a local export list, `export default`, `export =`, `export as namespace` (which carries no `export` modifier and would otherwise slip past a modifier-only scan), and ambient/overload signatures. Parity is two-way: an unregistered export and a stale registration are both violations, and a registered *type* export reappearing as a runtime value is reported as the new capability it is. The set of modules that must be pinned is **derived** from `RESTRICTED_IMPORT_TARGETS` (targets ∪ their permitted importers), so a new restricted capability cannot exist with an unpinned surface; the export *names* stay hand-reviewed. The guarantee is exactly this: these modules cannot add or forward a **public export** without a policy and test change. It is a surface policy, not data-flow analysis — it does not inspect the bodies of already-approved functions. Extending one of these public APIs requires an explicit registry entry and a visible test change.
- **The read gateway is read-only by type, not only by convention.** `requireBattleRuntimeForPhase()` returns a `BattleRuntimeContext` in which every **runtime-owned** value and collection is `readonly` / `ReadonlyMap` / `readonly T[]`: the container, `BattleState`, units, active effects (including nested `effect` / `periodicHp`), coordinates, shapes, occupancy maps and their coord arrays, the deployment map and its records, participants, replay placements and pending auto-turn intentions. The single documented exception is the `ActionSkillDefinition` entries inside `unit.skills` — shared immutable static content from the `SKILLS` registry, not runtime-owned; the containing array is `readonly`. Importing the read gateway therefore cannot confer write authority: a runtime change requires constructing a complete replacement and installing it through `battleRuntimeWriteAccess`. Enforced at compile time by `tests/core/battleRuntimeReadonlyContract.test.ts`, which compiles `tests/type-contracts/battleRuntimeReadonly.contract.ts` against the real `tsconfig.json` and asserts the fixture is in the program — without that assertion a fixture dropped from the program would yield zero diagnostics and pass vacuously. The fixture uses two complementary mechanisms: a `MutableKeys` identity test checks record-property readonly **exhaustively** (a lost modifier fails as TS2344 naming the property, including ones no assignment statement mentions), and representative forbidden operations check every owned collection kind — `ReadonlyMap`, `readonly T[]`, `ReadonlySet` — for in-place mutation (failing as TS2578, unused `@ts-expect-error`). Casts (`as BattleState`, `as unknown as`, `-readonly` mapped types) that launder runtime data back into mutable types are prohibited. The defensive copies in `copyReplaySetup` and `battleSnapshotBuilder` stay — `readonly` is erased at runtime and does not replace value isolation.
- The write side has one owner per responsibility too: `phaseActionEffects` is the exhaustive action dispatcher and the owner of the per-manager gameplay RNG pair; `campaignLifecycle` and `debugLifecycle` own campaign/debug container creation; `campaignWorldTransitions` owns pure campaign-world transformations and `phaseHandlers/worldPhaseHandler` their storage seam; `battlePhaseEffects` owns battle runtime installation, mutation, replay and disposal. `phaseActionEffects` may contain exhaustive dispatch and cross-domain ordering, and must contain no campaign construction, debug session construction, world update logic, battle formula, snapshot construction or direct store write — enforced by its import list, which reaches owners only.
- `phaseActionEffects` holds its RNG pair in a factory closure, never at module scope, and every lifecycle action replaces the whole pair. `createDefaultPhaseActionEffects()` is the only production composition entry point; `createPhaseActionEffects()` takes a dependency set with no optional fields, so a test cannot silently fall back to a real owner.
- Resolver rejection and lifecycle corruption are different contracts. A rejected action is silent and public (`{ status: 'rejected' }`, effects never called); an action the resolver **accepted** arriving with an inconsistent phase is internal corruption and throws. Every authoritative battle consequence validates `BattleRuntimeContext.sessionSource` against the active battle phase inside its own operation, never relying on another owner having run first.
- Battle exit ordering is load-bearing: roster persistence → campaign world consequence → runtime teardown. Teardown is structural (`previous phase is battle` + `resolved phase is not`), never an action-name catalogue, so `replay` (battle → battle) and mutation-only battle actions keep their runtime.
- `PhaseManager` only runs resolver → effects → snapshot → scene sync/notification; it does not inspect action or phase types or access domain state.
- `PhaseManagerClass` has no default dependencies: it takes a required `PhaseManagerDependencies` set, and `createProductionPhaseManager()` is the single production composition path, used by both the exported singleton and the characterization harness. Each call builds a fresh `phaseActionEffects` controller, so no two managers share a gameplay RNG pair. The coordinator's public surface is exactly `init`, `getPhase` and `transition`, enforced by an AST scan against `PHASE_MANAGER_PUBLIC_API` that fails closed on index signatures, computed/unnamed members and public constructor parameter properties.
- `PhaseManager` dependencies and pipeline behavior are enforced by boundary checks and coordinator contract tests.
- Orchestration boundary rules (`scripts/orchestration-boundary-rules.mjs`) are shared, pure-data, and imported by both `scripts/check-boundaries.mjs` and its tests — no duplicated policy literals, including the real `scenes/**` policy (`SCENES_IMPORT_POLICY`). Import-specifier normalization has one shared implementation (`scripts/import-specifier.mjs`) used by the checker and by the tests that enforce the same rules; a second normalization could disagree with production about a single import.
- The three orchestration facades (`phaseActionEffects`, `phaseTransitionMetadata`, `phaseSnapshotRebuilder`) have exact import policies **compiled from a collaborator registry** (`ORCHESTRATION_COLLABORATOR_REGISTRY`), never hand-maintained beside it. Every direct dependency is one classified edge — the role describes the module's relationship *to the consuming facade*, so `GameState` is an `authoritative-state-reader` for the read-side facades and is forbidden outright for the effects facade. The facade-kind × role matrix (`FACADE_KIND_ROLES`) is what enforces authority: `effects` can register no state reader and no snapshot projection, and neither read-side facade can register an effects owner. Distinctions within one permitted row are descriptive classification, not extra enforcement.
- Registered collaborators and actual imports must match **exactly, in both directions**. An unregistered import and a stale registration are separate violations: a subset-only allowlist would let a deleted dependency leave a dormant permission behind, which is how a facade regrows authority without review. Adding or removing any facade dependency requires a registry update and a visible test change. Roles are reviewed permissions — they do not inspect function bodies, and they do not replace the behavioural suites that protect routing, lifecycle ordering, non-mutation, snapshots, RNG ownership and transient feedback. This stage closes facade imports and uses no size, complexity or method-name metric.
- `PhaseTransitionMetadata` is a neutral contract in `core/phaseTransitionMetadataContract.ts` with an empty import allowlist, and is deliberately **not** re-exported from `phaseTransitionResolver`. Declaring it in the resolver would force the metadata facade to import the router, and a module-level allowlist cannot distinguish "may name the type" from "may call `resolveTransition`"; declaring it in the derivation module would force the pure resolver to import a `GameState` reader. The resolver's own allowlist is exactly `core/phases` + that contract, and is pinned by tests rather than living inside the checker.
- Every phase handler under `src/core/phaseHandlers/` (any nesting, `.ts` or `.tsx`) requires exactly one of an explicit `PHASE_HANDLER_IMPORT_POLICIES` entry or a reasoned, non-duplicated coverage exclusion; a new handler file without one, or with both, fails `check-boundaries.mjs`.
- Scenes (including `scenes/controllers/**`) may not import state stores (`GameState`, `DebugBattleState`, `playerSessionStore`), lifecycle owners (`debugLifecycle`, `campaignLifecycle`), phase handlers and pipeline internals (`phaseActionEffects`/`phaseTransitionMetadata`/`phaseSnapshotRebuilder`/`phaseTransitionResolver`/`phaseChangeNotifier`/`phaseEffectsResult`), battle runtime, its storage cell, either access gateway or its effects owner (`battleRuntimeContext`, `battleRuntimeAccess`, `battleRuntimeStorage`, `battleRuntimeWriteAccess`, `battlePhaseEffects`), campaign write transformations (`campaignWorldTransitions`), or any module that builds the committed `GamePhase` snapshot from authoritative state, including its internal helpers (`battlePhaseSnapshot`, `battleSnapshotBuilder`, `battleResultsSnapshot`, `equipmentScreenSnapshot`, `unitStatsSnapshot`, `rosterCampSnapshot`, `upgradeTreeSnapshot`, `worldMapProjection`) — not even type-only. Scenes render the committed `GamePhase`; they never resolve runtime and never rebuild the snapshot themselves. Scene-facing **presentation adapters** are a distinct category and stay importable: `battleDirectiveProjection` and `battleSkillPreviewProjection` derive transient presentation models only from committed `GamePhase` data or call-scoped transition feedback. The snapshot *types* scenes consume live in `shared/battleSnapshots.ts` and stay importable too.
- The public transition contracts scenes *may* import are `phaseTransitionResult` and `battleActionFeedback`. `battleActionFeedback` is presentation/control output, never render state and never authoritative state: it shares no object reference with `BattleState`, `TurnContext`, or `BattleRuntimeContext` at any depth, and its narrowed DTOs deliberately drop the internal directive's `activeSkill` and `validTargets` (the latter aliases `BattleState.validTargets`) and the auto-turn intention's action payload.
- `battleActionFeedback`, `phaseTransitionResult` and `phaseEffectsResult` each carry a tiny fail-closed import allowlist (`TRANSITION_CONTRACT_IMPORT_POLICIES`), pinned exactly by `tests/scripts/boundaryPolicy.test.ts` — a contract module can never acquire a stateful dependency without a visible test change.
- Gameplay Phaser scene control (`start`/`stop`/`launch`/...) is confined to `scenes/phaserSceneSynchronizer.ts` (any target, since it resolves keys from a compile-time-exhaustive phase→scene map), plus exactly two named bootstrap edges: `Boot.ts` → `this.scene.start("Preloader")` and `Preloader.ts` → `this.scene.start("MainMenu")`, each permitted at most once. Every other file, and any other call in those two files, is scanned (dotted and element-access forms, direct and one-level lexically-scoped aliases) and rejected by `scripts/scene-control-policy.mjs`.
- Phaser scene transitions never carry gameplay data — enforced by the argument-count rules in the same scanner.
- A boundary failure must be resolved before completion, either by correcting the code or by an explicit reviewed policy update. It must never become an accepted baseline.

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
