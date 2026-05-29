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
- [types.ts](types.ts) — all battle-time types (`BattleState`, `Unit`, `ActiveEffect`, `OccupancyMap`, `Phase`, `BattleMode`)
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
- Combat death is represented by `lifeState: 'dead'` and `hp: 0`. Use `killUnit()` / `reviveUnit()` from `lifeState.ts`; do not flip the field manually.
- Death clears `activeEffects`. Revive does not restore previous buffs, debuffs, or periodic HP effects.

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
All skills in `data/skills/skillDefinitions.ts` are authored as `ActionSkillDefinition`.

`compileSkillUsePlan` in `skillPlanCompiler.ts` accepts `ActionSkillDefinition` and delegates to
`compileActionSkillDefinition` (`actionSkillDefinitionCompiler.ts`).

The executor (`skillExecution.ts`) and counter-attack both run through `SkillUsePlan` exclusively.

**Matrix resolution**
- `skillMatrixResolver.ts` contains all scaling computation logic for multiplier and probability matrices.
- `MULTIPLIER_MATRICES` and `PROBABILITY_MATRICES` use `ScalingSkillMatrix` — values are computed
  by linear formula for any requested level >= 1; there are no explicit level entries authored.
- `EFFECT_AREA_MATRICES` store `EffectAreaPattern` directly — static shapes, no levels, no scaling.
  Effect-area refs carry only `matrixName` (no `level`); resolution is a plain registry lookup.
- `resolvePlanPattern()` in `skillPlanPatterns.ts` is the single facade for all matrix kinds,
  used by both preview and execution. Multiplier and probability refs carry `level` and are
  computed; effect-area refs carry only `matrixName` and return the static shape directly.

**Targeting**
- `SkillUsePlan.targetPolicy` is authoritative for target resolution, auto/quick target choice,
  manual prompt kind, and target highlight kind.

**Power source and power calculation**
- `PowerSource` values are `physical_strength` and `magical_strength`.
- `physicalStrength` / `magicalStrength` are the scaling field names on units.
- All caster-scaled skill actions (`damage`, `heal`, `apply_periodic_hp_effect`) use
  `getEffectiveUnitPower()` from `skillPower.ts`. Active effects on the caster always
  affect output. There is no raw/effective switch — `PowerMode` does not exist.
- Effective power is clamped to zero: a debuff can reduce output to zero but cannot
  produce a negative value that would invert the direction of a heal or periodic HP effect.
- Skill damage resolution derives the defense branch from `powerSource`:
  - `physical_strength` → `physicalDefense`
  - `magical_strength` → `magicalDefense`
  Target defense/dodge/block apply to `damage` only — not to `heal` or `apply_periodic_hp_effect`.
- `combat.ts` may import type-only contracts from `skillUsePlan.ts`.
  `skillUsePlan.ts` is a contract-only file and must never import `combat.ts`.
- Effect registry classification uses `effectKind: "periodic_hp" | "stat_modifier"`. Periodic HP
  scaling: `amountPerTurn = getEffectiveUnitPower(caster, powerSource) × hit cell multiplier`.
  The matrix for `apply_periodic_hp_effect` must be a `multiplier_matrix` (from `MULTIPLIER_MATRICES`);
  `effect_area_matrix` is reserved for `apply_stat_effect` (shape-only, multiplier always 1, ignored at runtime).
  If a unit is hit by multiple cells, the highest resulting amount is used.

**SkillUsePlan action fields are semantic**
- `apply_stat_effect` and `apply_periodic_hp_effect` actions expose `effect: EffectApplicationMeta`
  directly. There is no `effectBlock` on the plan surface.
- Lower-level combat helpers (`applyEffectApplication`, `applyPeriodicHpEffectApplication`,
  `applyVampirism`, `resolveInstantEffects`) accept semantic refs from `shared/skillTypes.ts`
  directly (`AppliedEffectMeta`, `PostDamageEffect`, `InstantEffectApplication`, `DamageModifierRef`).
  There are no adapter functions at the executor boundary — `skillExecution.ts` passes
  `action.effect`, `action.postDamage`, and `action.instantEffect` directly.
- `applyEffectApplication` handles stat modifier effects only. `applyPeriodicHpEffectApplication`
  handles periodic HP effects and computes per-cell `amountPerTurn` from the matrix multiplier.

**Hostile damage**
- Hostile skills must carry an explicit `damage` action in their `ActionSkillDefinition`.
  There is no implicit fallback damage step. Skills like `weaken_curse` that deal damage
  must author it as a `damage` action with an explicit `powerSource` and `matrix`.

**Periodic HP direction and amount**
- `ActiveEffect.periodicHp` is the sole runtime source for periodic HP direction and amount.
  `amountPerTurn` is set at effect application time from the matrix cell that hit the unit
  (via `applyPeriodicHpEffectApplication`). Each affected unit may receive a different amount.
- `effect.effectTone` is presentation/classification metadata only — not a direction source.
  `effectTone` is independent of `UnitUpgradeStatLineSnapshot.tone` (upgrade card display) —
  they share the same value vocabulary but are separate fields on separate types.
- `tickEffects` reads periodic HP via `resolveActiveEffectPeriodicHp()` from `shared/activeEffect`.
