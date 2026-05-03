# battle

## Role
Pure battle domain logic — all computations, state mutations, and validations that make a battle work. No rendering, no Phaser, no scene knowledge.

## Responsibilities
- Define the runtime `BattleState` and all battle-time types
- Resolve combat: damage, healing, effects, and AOE patterns
- Track unit positions on the grid (occupancy)
- Manage placement phase: bench ↔ field swaps, unit positioning
- Compute turn order and maintain the round queue
- Instantiate units from blueprints and auto-place them on the field

## Key Files
- [types.ts](types.ts) — all battle-time types (`BattleState`, `Unit`, `ActiveEffect`, `OccupancyMap`, `BenchUnitRef`, `Phase`, `BattleMode`)
- [combat.ts](combat.ts) — damage, healing, effect application, vampirism, game-over check; emits `CombatEvent`/`AttackResult`
- [initiative.ts](initiative.ts) — builds and prunes the round queue by initiative order
- [placement.ts](placement.ts) — low-level validation and field-placement of units
- [placementState.ts](placementState.ts) — UI-level placement actions (bench/field selection, swaps, moves)
- [occupancy.ts](occupancy.ts) — builds and updates the bidirectional `OccupancyMap`
- [targeting.ts](targeting.ts) — computes valid target cells per skill type (melee, ranged, friendly, self)
- [skillPatterns.ts](skillPatterns.ts) — resolves `SkillPattern` → `ResolvedHitCell[]` for AOE targeting and damage
- [shapes.ts](shapes.ts) — computes all cells occupied by a unit from its anchor and shape offsets
- [field.ts](field.ts) — coordinate primitives: `cellKey()`, `cellExists()`
- [unitFactory.ts](unitFactory.ts) — constructs a runtime `Unit` from a `CreateUnitInstanceInput`
- [autoPlace.ts](autoPlace.ts) — places player/enemy units on the field at battle start
- [itemOps.ts](itemOps.ts) — item equip/unequip, inventory queries, stat computation from equipment

## Structural Role
`src/battle` → pure battle domain; consumed by `src/core` orchestration layer

## Data Flow
`BattleState` + action inputs (skill use, placement gesture, round tick)
↓
battle functions validate, compute, mutate
↓
new `BattleState` (spread — never mutated in place)
↓
returned to `src/core` for phase transition or rendering

## Dependencies
- depends on: `src/shared` (grid, skill, unit, item, snapshot types), `src/data` (skill definitions, shape definitions)
- used by: `src/core` (battle initialization, phase handlers, `PhaseManager`)

## Invariants
- All state-mutating functions return a **new** `BattleState`; they never mutate in place
- `OccupancyMap` is always rebuilt via `buildOccupancy()` after any unit position change
- A unit may hold at most **2** active effects; the oldest is evicted when a third is applied
- Placement validation is anchor-based: shape offsets from the anchor define all occupied cells
- No Phaser, scene, or rendering imports anywhere in this folder
- Battle modules must not import `src/scenes/`, `src/objects/`, or `src/ui/`
- UI-facing display formatting (prompt text, log text, preview estimates) belongs in `src/objects/*Presentation.ts`, not in battle rule modules

## Where to Modify
- add/change a unit stat computation → [itemOps.ts](itemOps.ts) `computeUnitBattleStats()`
- change damage or healing resolution → [combat.ts](combat.ts)
- change turn-order rules → [initiative.ts](initiative.ts)
- change AOE or targeting patterns → [skillPatterns.ts](skillPatterns.ts), [targeting.ts](targeting.ts)
- change placement rules or bench/field interactions → [placement.ts](placement.ts), [placementState.ts](placementState.ts)
- change unit shape/size → [shapes.ts](shapes.ts)
- change initial field layout at battle start → [autoPlace.ts](autoPlace.ts)
- add a new battle-time type → [types.ts](types.ts)

## Current Skill Runtime Semantics

`ActionSkillDefinition` (from `shared/skillDefinitionTypes.ts`) is the active skill authoring contract.
All skills in `data/skillDefinitions.ts` are authored as `ActionSkillDefinition`.

`compileSkillUsePlan` in `skillPlanCompiler.ts` accepts `ActionSkillDefinition` and delegates to
`compileActionSkillDefinition` (`actionSkillDefinitionCompiler.ts`).

The executor (`skillExecution.ts`) and counter-attack both run through `SkillUsePlan` exclusively.

**Targeting**
- `SkillUsePlan.targetPolicy` is authoritative for target resolution, auto/quick target choice,
  manual prompt kind, and target highlight kind.

**Power source**
- `PowerSource` values are `physical_strength` and `magical_strength`.
- `physicalDamage` / `magicalDamage` are the current scaling field names on units.
- `LEVELED_EFFECTS.effectDamageType` is legacy registry metadata retained for the effect registry.
  For active `ActionSkillDefinition` skills, per-turn HP scaling is set by `action.powerSource`
  on the `apply_periodic_hp_effect` action — not by `effectDamageType`.

**effectBlock is shared**
- `effectBlock` is independent from heal/damage. Both friendly-targeted and hostile-targeted
  skills can carry one.

**Hostile damage**
- Hostile skills must carry an explicit `damage` action in their `ActionSkillDefinition`.
  There is no implicit fallback damage step. Skills like `weaken_curse` that deal damage
  must author it as a `damage` action with an explicit `powerSource` and `matrix`.

**Periodic HP direction bridge (Stage 10+)**
- `ActiveEffect.periodicHp` is authoritative for runtime HP tick direction when present.
- `computedPerTurn + effect.isBuff` is the legacy fallback for pre-plan active effects.
- `effect.isBuff` is presentation/classification metadata only.
- `tickEffects` uses `resolveActiveEffectPeriodicHp()` from `shared/activeEffect` for compatibility resolution.
- `computedPerTurn` is intentionally retained as a temporary bridge.
  See TODO in `shared/activeEffect.ts`.
