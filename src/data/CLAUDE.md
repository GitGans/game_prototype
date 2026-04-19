# data/

## Role

Static game content layer. Contains all definitions for units, items, and skills. No logic — only constant data consumed by the rest of the system.

---

## Responsibilities

- Define all player and enemy unit blueprints
- Define the player's starting lineup and bench
- Define all equippable items and their stat bonuses
- Define all named skills and their patterns and damage types
- Group enemy blueprints by race for battle initialization

---

## Key Files

| File                  | Purpose                                                               |
| --------------------- | --------------------------------------------------------------------- |
| `unitDefinitions.ts`  | All unit blueprints — player units, starting IDs, enemy pools by race |
| `itemDefinitions.ts`  | All item definitions — slots, stat bonuses, class restrictions        |
| `skillDefinitions.ts` | All named skills — pattern reference, damage type, effect type        |

### unitDefinitions.ts

- `PLAYER_UNITS` — array of all 9 playable unit blueprints
- `PLAYER_STARTING_IDS` — 5 unit `templateId`s placed on field at start; rest go to bench
- `ENEMY_UNITS` — map of `UnitRace` → enemy blueprint array (orc, demon, undead)

### itemDefinitions.ts

- `ITEM_DEFINITIONS` — `Record<string, ItemDefinition>` of all equippable items

### skillDefinitions.ts

- `SKILLS` — `Record<string, Skill>` of all named skills; each references a `SkillPattern` from `battle/skillPatterns.ts`

---

## Structural Role

```
data/ → static content (blueprints and definitions, no runtime state)
```

---

## Data Flow

```
Static definitions defined here
↓
battle/autoPlace.ts reads unit blueprints to create instances
↓
scenes/Prep.ts reads item/unit data for display and equip UI
↓
battle/combat.ts and targeting.ts use skill/pattern data at runtime
```

---

## Key Dependencies

**data/ depends on:**

- `battle/shapes.ts` — `SHAPES` used in unit `shape` fields
- `battle/skillPatterns.ts` — `PATTERNS` used in skill `pattern` fields
- `battle/types.ts` — type definitions (`UnitBlueprint`, `ItemDefinition`, `Skill`, `UnitRace`, `EquipSlot`)

**Depends on data/:**

- `battle/autoPlace.ts` — consumes `PLAYER_UNITS`, `ENEMY_UNITS`
- `scenes/Prep.ts` — reads unit and item definitions for UI
- `core/GameState.ts` — references `PLAYER_STARTING_IDS` via `autoPlace`

---

## Critical Invariants

- All `templateId` values in `PLAYER_UNITS` and `ENEMY_UNITS` must be globally unique
- All `shape` references must exist in `SHAPES`
- All `skill` references in unit blueprints must exist in `SKILLS`
- All `pattern` references in `SKILLS` must exist in `PATTERNS`
- `PLAYER_STARTING_IDS` must only contain valid `templateId`s from `PLAYER_UNITS`
- `ITEM_DEFINITIONS` keys must match each item's `id` field

---

## Where to Modify

| What to change            | File                                              |
| ------------------------- | ------------------------------------------------- |
| Add or edit a player unit | `unitDefinitions.ts` → `PLAYER_UNITS`             |
| Change starting lineup    | `unitDefinitions.ts` → `PLAYER_STARTING_IDS`      |
| Add or edit an enemy unit | `unitDefinitions.ts` → `ENEMY_UNITS`              |
| Add or edit an item       | `itemDefinitions.ts` → `ITEM_DEFINITIONS`         |
| Add or edit a skill       | `skillDefinitions.ts` → `SKILLS`                  |
| Add a new skill pattern   | `battle/skillPatterns.ts` → `PATTERNS` (not here) |
