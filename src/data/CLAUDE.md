# data

## Role
Central game data definitions layer — all playable content, combat configurations, and world layouts live here. No logic, only structured declarations consumed by the rest of the system.

## Responsibilities
- Define all unit blueprints (player and enemy) with stats, skills, and progression tiers
- Declare all skills, damage patterns, effects, and their level scaling
- Specify item properties, stat bonuses, and usage types
- Describe world map layouts, tile types, and entity placements
- Group enemy encounter configurations by race and variant

## Key Files
- `unitDefinitions.ts` — player unit blueprints (`PLAYER_UNITS`), enemy templates by race (`ENEMY_UNITS`), starting roster IDs
- `skillDefinitions.ts` — skill catalog (`SKILLS`), damage/effect matrices, level-scaling helpers (`getSkillPattern`, `getEffectPattern`, etc.)
- `itemDefinitions.ts` — item catalog (`ITEM_DEFINITIONS`), stat bonus descriptions (`getItemDescription`)
- `enemyGroupDefinitions.ts` — encounter group configs (`ENEMY_GROUPS`), maps group id → race + optional level override
- `mapDefinitions.ts` — world map grid layouts (`MAP_DEFINITIONS`) with tile types, mob spawns, and player start positions

## Structural Role
`src/data` → declarative content layer consumed by battle, world, and UI systems

## Data Flow
Unit/skill/item/map definitions (static config)
↓
Imported by core managers (PhaseManager) and battle/scene modules
↓
Runtime queries (e.g. getSkillPattern at level N)
↓
Game state populated and rendered

## Dependencies
- depends on: `src/battle/types.ts` (shared type interfaces for units, skills, items, effects)
- used by: `src/core/PhaseManager.ts` (initialization), `src/battle/` (combat calculation), `src/scenes/` (rendering and world state), `src/objects/` (tooltips and upgrade UI)

## Invariants
- Skill level indices are 0-based (level 1 = index 0 in matrices)
- Damage multipliers use 0–1 scale (1.0 = 100%)
- Every skill referenced in a unit blueprint must exist in `SKILLS`
- Enemy units use the same `SKILLS` table as player units — no separate enemy-only skill catalog
- `PLAYER_STARTING_IDS` entries must correspond to valid `PLAYER_UNITS` template ids

## Where to Modify
- add/change a unit stat or skill tier → `unitDefinitions.ts`
- add/change a skill, damage pattern, or effect → `skillDefinitions.ts`
- add/change an item or stat bonus → `itemDefinitions.ts`
- add/change an enemy encounter group → `enemyGroupDefinitions.ts`
- add/change a world map layout → `mapDefinitions.ts`
