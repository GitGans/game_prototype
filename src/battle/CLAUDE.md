# battle/

## Role

Core game logic layer. Pure TypeScript — zero Phaser. Responsible for all domain rules: placement, targeting, combat, skill resolution, item bonuses, and turn order. Produces new state from old state; never renders anything.

---

## Responsibilities

- Define all shared types for the battle system
- Validate and execute unit placement on the grid
- Build and maintain cell-to-unit occupancy maps
- Determine valid targets for melee, ranged, and healing actions
- Resolve damage and healing (with defense, multipliers, deduplication)
- Define skill AoE patterns and resolve them to real cell coordinates
- Manage turn order queue (build and prune dead units)
- Instantiate unit instances from blueprints with level scaling and item bonuses
- Handle all item state operations (equip, unequip, move, bonus calculation)

---

## Key Files

| File               | Purpose                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| `types.ts`         | All shared interfaces and type aliases — the foundation of the entire system |
| `field.ts`         | Cell coordinate utilities: `cellKey()`, `cellExists()`                       |
| `shapes.ts`        | Unit shape definitions (`SHAPES`) and occupied cell calculation              |
| `occupancy.ts`     | Build and update cell↔unit bidirectional map                                 |
| `placement.ts`     | Validate and commit unit placement                                           |
| `autoPlace.ts`     | Instantiate units from blueprints; auto-place player and enemy units         |
| `itemOps.ts`       | All item mutations: equip, unequip, move, locate, bonus sum                  |
| `targeting.ts`     | Compute valid melee, ranged, and friendly target cells                       |
| `combat.ts`        | Apply damage and healing; check game-over condition                          |
| `skillPatterns.ts` | AoE pattern definitions (`PATTERNS`) and pattern-to-cells resolution         |
| `initiative.ts`    | Build turn queue from initiative values; prune dead units                    |

### Key exports by file

**field.ts** — `cellKey(coord)`, `cellExists(coord)`

**shapes.ts** — `SHAPES`, `getOccupiedCells(anchor, shape)`

**occupancy.ts** — `buildOccupancy(units)`, `removeUnit(unitId, occupancy)`

**placement.ts** — `canPlace(anchor, shape, state, side)`, `placeUnit(unit, state)`

**autoPlace.ts** — `createUnitInstance(blueprint, id, anchor, levelOverride?)`, `autoPlacePlayer(state)`, `autoPlaceEnemies(state, playerAvgLevel?, forceRace?)`, `blueprintFromUnit(unit)`, `getPlayerAverageLevel(state)`

**itemOps.ts** — `equipItem(...)`, `unequipItem(...)`, `getEquippedItems(...)`, `getEquippedBonuses(...)`, `moveItem(...)`, `findFreeBackpackSlot(container)`, `findItemLocation(instanceId, containers)`

**targeting.ts** — `getMeleeTargets(attacker, occupancy)`, `getRangedTargets(attackerSide, occupancy)`, `getFriendlyTargets(side, occupancy)`, `isFrontRowAlive(side, occupancy)`

**combat.ts** — `resolveAttack(hitCells, baseDamage, damageType, state)`, `resolveHeal(hitCells, baseHeal, state)`, `checkGameOver(state)`

**skillPatterns.ts** — `PATTERNS`, `resolvePattern(target, pattern)`

**initiative.ts** — `buildRoundQueue(units)`, `pruneQueue(queue, units)`

---

## Structural Role

```
battle/ → core domain logic (pure TypeScript, no rendering)
```

---

## Data Flow

```
Blueprint + level + equipped items
↓ autoPlace / createUnitInstance
Unit instances placed into BattleState
↓ placement / occupancy
Valid targets computed from occupancy
↓ targeting
Pattern resolved to hit cells
↓ skillPatterns
Damage / heal applied to state
↓ combat
Dead units removed; game-over checked
↓ initiative
Queue pruned; next turn begins
```

---

## Key Dependencies

**battle/ depends on:**

- `battle/types.ts` — all other files import from here
- `core/Constants` — `autoPlace.ts` uses layout constants
- `core/GameState` — `autoPlace.ts` reads persistent player state and item containers
- `data/unitDefinitions` — `autoPlace.ts` reads unit blueprints
- `data/itemDefinitions` — `autoPlace.ts` reads item definitions

**Depends on battle/:**

- `scenes/Game.ts` — calls placement, targeting, combat, initiative, autoPlace
- `scenes/Prep.ts` — calls itemOps
- `objects/*` — reads `BattleState` fields for rendering (read-only)

---

## Critical Invariants

- All files in `battle/` must be zero-Phaser — no rendering code
- `types.ts` has no imports — it is the base layer
- `resolveAttack` deduplicates large multi-cell units (highest damage wins per unit)
- `resolvePattern` silently clips out-of-bounds cells — never throws
- `buildRoundQueue` must interleave player and enemy at each initiative tier
- `createUnitInstance` applies level scaling to `hp`, `physicalDamage`, `magicalDamage`, `healAmount` only — defense fields do not scale
- `getEquippedBonuses` returns `{}` (not an error) when a unit's container is missing

---

## Where to Modify

| What to change                                      | File                                    |
| --------------------------------------------------- | --------------------------------------- |
| Add or rename a type / interface                    | `types.ts`                              |
| Change grid dimensions or cell validation           | `field.ts`                              |
| Add a new unit shape                                | `shapes.ts` → `SHAPES`                  |
| Change placement validation rules                   | `placement.ts` → `canPlace()`           |
| Change level scaling formula                        | `autoPlace.ts` → `createUnitInstance()` |
| Change enemy auto-placement strategy                | `autoPlace.ts` → `autoPlaceEnemies()`   |
| Add a new item operation                            | `itemOps.ts`                            |
| Change targeting rules (front row, melee vs ranged) | `targeting.ts`                          |
| Change damage formula or defense reduction          | `combat.ts` → `resolveAttack()`         |
| Add a new AoE pattern                               | `skillPatterns.ts` → `PATTERNS`         |
| Change turn-order logic                             | `initiative.ts` → `buildRoundQueue()`   |
