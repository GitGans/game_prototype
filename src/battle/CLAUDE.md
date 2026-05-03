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

The skill executor in `skillExecution.ts` has legacy couplings that will be normalized in a later stage.

**Targeting vs. effect semantics**
- `actionType` is a targeting category: `melee`/`ranged` = hostile, `mass_enchantment`/`self_enchantment` = friendly/self.
- `mass_enchantment` and `self_enchantment` are NOT heal semantics. Healing is a current compatibility rule:
  enchantment-targeted skill => healing step always runs (via `getSkillHitCellsForSkill` including fallback).

**Power source coupling**
- `physicalDamage` / `magicalDamage` are the current legacy scaling field names.
- `damageBlock.damageType` currently selects both the source stat and the defense branch for hostile damage.
- `LEVELED_EFFECTS.effectDamageType` selects the scaling source for per-turn HP effects, not `SkillEffectBlock.damageType`.

**effectBlock is shared**
- `effectBlock` is independent from heal/damage. Both enchantment-targeted and hostile-targeted skills can carry one.

**Hostile fallback**
- Hostile skills without `damageBlock` still execute a physical single-cell damage step. This is current behavior,
  not a bug. Any normalization must preserve this fallback explicitly.

**Periodic HP direction bridge (Stage 10+)**
- `ActiveEffect.periodicHp` is authoritative for runtime HP tick direction when present.
- `computedPerTurn + effect.isBuff` is the legacy fallback for pre-plan active effects.
- `effect.isBuff` is presentation/classification metadata. After Stage 10 it does NOT determine tick direction for any active effect produced by `executeSkillUsePlan`.
- `tickEffects` uses `resolveActiveEffectPeriodicHp()` from `shared/activeEffect` for the compatibility resolution.
- `computedPerTurn` is intentionally retained as a temporary bridge. See TODO in `shared/activeEffect.ts`.

Future work: normalize skills into targeting policy, actions, and power source while preserving current runtime behavior
until an explicit migration of skill definitions.
