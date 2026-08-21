# src

## System Role

Browser-based turn-based grid game built with TypeScript and Phaser.
Phaser is used for rendering only; all game logic lives in pure TypeScript.
The system is split into layers: static content definitions, domain logic, orchestration, and scene rendering.

## Responsibilities

* Define all game content (units, skills, items, maps)
* Model and enforce battle and world rules
* Orchestrate game flow through a strict phase-transition pipeline
* Render game state via stateless Phaser scenes
* Provide reusable UI primitives and game-specific visual components
* Maintain two isolated state trees: persistent campaign state and transient battle state

## Folder Map

* shared/   → cross-cutting type contracts shared by all layers
* data/     → static content definitions (units, skills, items, maps)
* world/    → world-map logic and types
* battle/   → battle domain rules (placement, combat, targeting, initiative)
* inventory/→ pure inventory & equipment domain (containers, equip, bonuses, item use, snapshots, pricing)
* progression/→ unit progression domain (roster state, class/upgrade resolution, stats)
* campaign/ → persistent campaign state contract (`CampaignState`) — the only future save source
* save/     → future save/load boundary contract (`SaveRepository`); no implementation yet
* core/     → game orchestration: PhaseManager, GameState, phase definitions, transitions
* objects/  → game-specific visual components (unit views, tooltips, skill bars)
* ui/       → reusable, game-agnostic UI primitives (buttons, inputs, theme)
* scenes/   → Phaser scenes — composition, input handling, PhaseManager triggers only

## Architecture Overview

```
data + shared
      ↓
battle / world          (domain logic, no Phaser)
      ↓
core (PhaseManager)     (orchestration, phase transitions, state)
      ↓
objects                 (game visuals, uses ui/)
      ↓
ui                      (base rendering primitives)
      ↓
scenes                  (compose objects + ui, trigger PhaseManager)
```

## Data Flow

```
user input (scene)
↓
PhaseManager.transition()
↓
resolveTransition()  →  next GamePhase  (pure, no side effects)
↓
applyActionSideEffects()  →  mutate CampaignState / BattleState
↓
PhaseSceneSynchronizer.sync(phase)  →  start scene
↓
scene reads GamePhase and renders
```

`PhaseManager` (`src/core/`) never touches Phaser directly — it delegates scene start/stop to an
injected `PhaseSceneSynchronizer` (contract in `core/`, Phaser implementation in
`scenes/phaserSceneSynchronizer.ts`). `core/**` must not import `phaser` at all, including
type-only imports — enforced by `check-boundaries.mjs`.

## Entry Points

* bootstrap    → src/main.ts (Phaser game config)
* first scene  → scenes/Boot.ts
* flow control → core/PhaseManager.ts

## Dependencies

* shared   → no dependencies on other src folders
* data     → depends only on shared
* battle   → depends on shared; no Phaser
* world    → depends on shared; no Phaser
* inventory→ depends on shared, data; no Phaser; no GameState; no battle/core/progression
* progression→ depends on shared; no battle/core/objects/scenes/ui/world
* campaign → depends on shared, progression, inventory, world (type contracts only); no battle/core/scenes/objects/ui; no save (one-way: save → campaign, never the reverse)
* save     → depends only on campaign (the `CampaignState` contract) and shared; no core/battle/scenes/objects/ui/phaser. Every other layer is blocked from importing save/, except core (the future save/load orchestrator)
* core     → depends on shared, battle, world, data, inventory, progression, campaign
* objects  → depends on shared, core; uses ui
* ui       → no game knowledge; no core/battle/world imports
* scenes   → depends on all layers; only entry point allowed to trigger PhaseManager

## Invariants

* Scenes are stateless — they read from GamePhase and handle input only
* All screen transitions go through PhaseManager; no scene.start/stop outside it
* resolveTransition() must be pure — no Phaser calls, no state mutation
* CampaignState and BattleState must not mix
* UI primitives (ui/) must have zero game-domain knowledge
* GamePhase is the single source of truth for what a scene renders
* Every top-level directory under src must have a directory boundary rule or an
  explicit, reasoned exclusion in check-boundaries.mjs
* Roster/camp rules live only in `progression/rosterCamp.ts`, and battle selection is
  distinct from living-party membership:
  * every unit outside camp is **selected for battle**, alive or dead — a persistent-dead
    unit is deployed into the next battle as a corpse and can be revived there
  * selected-party capacity (`MAX_SELECTED_BATTLE_PARTY_SIZE = 9`) counts dead units, because
    they consume a field or bench deployment
  * starting a battle requires at least one **living** selected unit
    (`MIN_LIVING_BATTLE_PARTY_SIZE = 1`); beginning combat additionally requires a living
    player unit on the field
  * no scene or projection re-derives these bounds — they are forwarded through GamePhase

## Where to Modify

* add/change game content (units, skills, items)      → data/
* change battle rules (combat, targeting, placement)  → battle/
* change world-map rules                              → world/
* add a new game screen or transition                 → core/phases.ts + core/PhaseManager.ts + scenes/
* change the persistent campaign state shape           → campaign/campaignState.ts
* change the save/load boundary contract               → save/saveTypes.ts
* change how a new campaign is initialized             → core/initCampaignState.ts + data/campaignInitialStateDefinition.ts
* change runtime ownership of campaign/debug/battle state → core/GameState.ts
* change a visual component tied to game data         → objects/
* change a reusable UI primitive                      → ui/
* change global styles or constants                   → ui/theme.ts (UI_THEME), core/Constants.ts
* change battle/unit visual tokens                    → objects/battleVisualTheme.ts
* change world-map visual tokens                      → objects/worldMapVisualTheme.ts
* change item/equipment visual tokens                 → objects/itemVisualTheme.ts
* change prep-screen visual tokens                    → objects/prepVisualTheme.ts
* change layout scale helper                          → ui/layout.ts
