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
- [targeting.ts](targeting.ts) — computes valid target cells per skill type (melee, ranged, alive_friendly, self, dead_friendly)
- [skillPatterns.ts](skillPatterns.ts) — resolves `SkillPattern` → `ResolvedHitCell[]` for AOE targeting and damage
- [shapes.ts](shapes.ts) — computes all cells occupied by a unit from its anchor and shape offsets
- [field.ts](field.ts) — coordinate primitives: `cellKey()`, `cellExists()`
- [unitFactory.ts](unitFactory.ts) — constructs a runtime `Unit` from a `CreateUnitInstanceInput`
- [autoPlace.ts](autoPlace.ts) — places player/enemy units on the field at battle start
- [itemOps.ts](itemOps.ts) — item equip/unequip, inventory queries, stat computation from equipment
- [lifeState.ts](lifeState.ts) — `isAlive` / `isDead` / `killUnit` / `reviveUnit`; the only place that flips `Unit.lifeState`
- [deployment.ts](deployment.ts) — field/bench queries; living/dead/all field-helper split
- [deadFriendlyTargeting.ts](deadFriendlyTargeting.ts) — shared structural corpse-cell walker for dead-friendly targeting and (Stage 2+) revive. All callers must pass `deployments`; deriving anchors from cell maps is forbidden.
- [revive.ts](revive.ts) — revive HP table application (`computeReviveHp`), revive target resolution (`resolveReviveTargetsForAction`), and revive state mutation (`reviveUnitInBattle`). Both target resolution and state mutation must go through this module; do not duplicate corpse walking or call `reviveUnit` directly from execution code.
- [skillTargetSelection.ts](skillTargetSelection.ts) — shared auto/quick AI selection (`chooseSkillIndexForUnit`, `chooseSkillTargetForPlan`). Owns the policy-aware target choice and skill eligibility filtering for both `autoTurn.ts` and `quickTurn.ts`. Auto and quick turns must not duplicate skill/target selection.

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
- Death is a state transition, not deletion. Combat keeps dead units in `state.units` with `lifeState:'dead'`, `hp:0`, `activeEffects:[]`, and preserved deployment. `retainDeploymentsForUnits` is for true entity removal (bench eviction, debug remove) — not ordinary combat death.
- `buildOccupancy` is living-only blocking occupancy. Dead field units occupy no cells. `getUnitAtCell(state, coord)` returns a living blocking unit or null; for dead-unit-at-cell lookup walk `state.deployments` + `getOccupiedCells` instead.
- Field-helper split in `deployment.ts`:
    - `getFieldUnits` / `getFieldUnitEntries` — all field-deployed units (alive + dead)
    - `getLivingFieldUnits` / `getLivingFieldUnitEntries` — combat participants (the default)
    - `getDeadFieldUnits` / `getDeadFieldUnitEntries` — corpses / future revive targets
- `isAlive(unit)` is the combat eligibility predicate going forward. `isDead(unit)` covers canonical dead state AND legacy `hp <= 0` defensively; prefer `isAlive` for "can act / can be targeted / counts as living" checks.
- Queue construction and rebuild operate on living units only: `buildRoundQueue` includes only `isAlive` units, `pruneQueue` drops dead ids, and `rebuildRemainingQueue` only reorders ids already present in `remaining` (it never re-introduces ids and never queries beyond `remaining`). This pre-bakes the future revive rule: revived units do not enter the current round queue.
- `skipActiveTurn` and `chargeActiveTurn` recover from a missing/dead `roundQueue[0]` by advancing through `advanceTurn` (no `turn_skipped` / `turn_charged` event emitted; the returned `skipped` / `charged` boolean remains `false`).
- Ordinary combat helpers (`resolveAttack`, `resolveHealWithEvents`, `applyEffectApplication`, `applyPeriodicHpEffectApplication`, `resolveProbabilityEffects`, `applyVampirism`) silently skip dead targets — no event, no state change.
- Targeting policies split into two groups:
    - Living-only ordinary policies: `alive_friendly`, `self`, `enemy_melee`, `enemy_ranged`. These resolve through `state.occupancy` and never see dead units.
    - Side-relative dead policy: `dead_friendly`. Resolves dead field allies on the caster's side via deployment + `getOccupiedCells`. Does not consult occupancy. Works for both player and enemy casters.
- Dead-friendly corpse cell lookup must go through `deadFriendlyTargeting.ts` (`getDeadFriendlyCorpseCells`). Do not duplicate deployment + shape corpse walking in `targeting.ts`, future revive execution, or future revive preview.
- `resolveSkillTargetsForPolicy` takes `BattleState` (not `OccupancyMap`) because dead targeting needs deployment access. `unitAnchor` is always the caster's current field anchor.
- Dead-caster safety is enforced once, at the executor (`resolveCasterAndSkill`) and turn-flow entry points (`autoTurn`, `quickTurn`, `turnResolver`) — never inside the resolver. The resolver trusts that callers gate on `isAlive(caster)`.
- Campaign/map resurrection (targeting dead units on the world map) is future work outside `battle/`.
- Revive target resolution chokepoint is `resolveReviveTargetsForAction` (in `revive.ts`). Revive state-mutation chokepoint is `reviveUnitInBattle`. Both must route dead-friendly corpse geometry through `deadFriendlyTargeting.ts`.
- Revive amount is target `maxHp × REVIVE_HP_PERCENT_LEVELS[level]` (clamped to ≥1 via `Math.ceil`). Revive does not use caster power and does not consume matrix multipliers — the `effect_area_matrix` defines shape only.
- Revive does not restore previous `activeEffects` (death already cleared them).
- Revive does not insert the revived unit into the current `roundQueue`. `reviveUnitInBattle` reuses the existing `roundQueue` reference; the revived unit becomes eligible only on the next `buildRoundQueue` call.
- Skills containing a `revive` action must use `targetPolicy: { type: 'dead_friendly' }`. Enforced at compile time by `validateActionSkillDefinition` in `actionSkillDefinitionCompiler.ts`.
- `chooseSkillIndexForUnit` (`skillTargetSelection.ts`) filters skills by "has at least one valid target". Filtering must be RNG-free; only the final candidate pick consumes RNG. When no candidates exist, fallback delegates to `resolveRandomSkillIndex`.
- Skill preview reads `unitsById + deployments`. `fieldUnitCells` is render/hover data only and must not be the deployment source for revive geometry. The preview projection (`core/battleSkillPreviewProjection.ts`) builds the `deployments` map from `BattleUnitSnapshot.deployment`.

## Where to Modify
- add/change unit stat growth / final stat resolving → `src/progression/stats/` (`unitBaseStats.ts`, `unitResolvedStats.ts`)
- add/change equipment stat-bonus aggregation → [itemOps.ts](itemOps.ts) `getEquippedBonuses()`
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
