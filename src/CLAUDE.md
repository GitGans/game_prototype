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
syncPhaserScenes()  →  start scene
↓
scene reads GamePhase and renders
```

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
* core     → depends on shared, battle, world, data, inventory, progression
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

## Where to Modify

* add/change game content (units, skills, items)      → data/
* change battle rules (combat, targeting, placement)  → battle/
* change world-map rules                              → world/
* add a new game screen or transition                 → core/phases.ts + core/PhaseManager.ts + scenes/
* change persistent progression                       → core/GameState.ts
* change a visual component tied to game data         → objects/
* change a reusable UI primitive                      → ui/
* change global styles or constants                   → ui/theme.ts (UI_THEME), core/Constants.ts
* change battle/unit visual tokens                    → objects/battleVisualTheme.ts
* change world-map visual tokens                      → objects/worldMapVisualTheme.ts
* change item/equipment visual tokens                 → objects/itemVisualTheme.ts
* change prep-screen visual tokens                    → objects/prepVisualTheme.ts
* change layout scale helper                          → ui/layout.ts
