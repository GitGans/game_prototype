# data/

## Role
Static game content layer. Contains all definitions for units, items, skills, maps, and enemy encounter groups. No runtime logic — only constant data consumed by the rest of the system.

## Responsibilities
- Define all player and enemy unit blueprints with stats, shapes, and skill references
- Define the player's starting party composition
- Define all equippable and consumable items with stat bonuses and use effects
- Define all named skills with AoE damage matrices and effect patterns
- Define world map layouts with terrain grids and entity placements
- Group enemy units into named encounter compositions

## Key Files
- `unitDefinitions.ts` — player unit blueprints (`PLAYER_UNITS`, `PLAYER_STARTING_IDS`) and enemy pools (`ENEMY_UNITS` keyed by race)
- `skillDefinitions.ts` — skill records (`SKILLS`), AoE grids (`DAMAGE_MATRICES`, `EFFECT_MATRICES`, `INSTANT_EFFECT_MATRICES`), leveled modifiers, and pure pattern lookup helpers
- `itemDefinitions.ts` — item records (`ITEM_DEFINITIONS`) and `getItemDescription()` display helper
- `mapDefinitions.ts` — world map layouts (`MAP_DEFINITIONS`) with terrain and entity placement grids
- `enemyGroupDefinitions.ts` — named encounter groups (`ENEMY_GROUPS`) with race references and optional level overrides

## Structural Role
`data/` → single source of truth for all static game content; no logic, no state

## Data Flow
Static constant definitions
↓
Imported by `GameState`, `autoPlace`, `Prep`, `Game`, `mapLogic` at startup
↓
Instantiated into live unit, item, and map objects at runtime

## Dependencies
- depends on: `src/battle/types.ts` (type definitions), `src/battle/shapes.ts` (SHAPES)
- used by: `src/core/GameState.ts`, `src/battle/autoPlace.ts`, `src/scenes/Prep.ts`, `src/scenes/Game.ts`, `src/world/mapLogic.ts`

## Invariants
- No runtime logic — only data declarations and pure lookup helpers
- May only import from `src/battle/types.ts` and `src/battle/shapes.ts`; no Phaser, no other layers
- All `templateId`, item `id`, skill `id`, and map `id` values must be globally unique
- `PLAYER_STARTING_IDS` must only reference `templateId`s that exist in `PLAYER_UNITS`
- Sprite paths must match actual assets under `public/assets/sprites/`

## Where to Modify
- add or edit a player unit → `unitDefinitions.ts` → `PLAYER_UNITS`
- change starting party → `unitDefinitions.ts` → `PLAYER_STARTING_IDS`
- add or edit an enemy unit → `unitDefinitions.ts` → `ENEMY_UNITS`
- add or edit an item → `itemDefinitions.ts` → `ITEM_DEFINITIONS`
- add or edit a skill → `skillDefinitions.ts` → `SKILLS`
- add an AoE damage or effect pattern → `skillDefinitions.ts` → `DAMAGE_MATRICES` / `EFFECT_MATRICES`
- add or edit a map → `mapDefinitions.ts` → `MAP_DEFINITIONS`
- add or edit an encounter group → `enemyGroupDefinitions.ts` → `ENEMY_GROUPS`
