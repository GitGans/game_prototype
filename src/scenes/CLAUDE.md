# scenes/

## Role

Orchestration layer. Scenes manage game flow, control the Phaser lifecycle, wire together pure logic and UI objects, and drive all transitions between game states. No domain logic lives here — scenes call into `battle/` and update `core/GameState`.

---

## Responsibilities

- Define the full scene transition sequence (Boot → Preloader → MainMenu → Prep → Game)
- Load sprite assets before any scene needs them
- Initialize item state on first game start
- Let the player configure units, camp, and equipment before battle
- Drive the turn-based battle loop (placement, targeting, resolution, game over)
- Persist cross-battle data (levels, placements, bench, items) back to `GameState`

---

## Key Files

| File           | Purpose                                                                      |
| -------------- | ---------------------------------------------------------------------------- |
| `Boot.ts`      | Entry point — immediately starts Preloader                                   |
| `Preloader.ts` | Loads all sprite sheets for units and items; starts MainMenu                 |
| `MainMenu.ts`  | Start screen; calls `GameState.initItemsIfNeeded()`; leads to Prep           |
| `Prep.ts`      | Pre-battle setup — camp, shop placeholder, party/equipment UI; leads to Game |
| `Game.ts`      | Full battle scene — placement phase, turn loop, game-over handling           |

### Boot.ts

- No UI, no state. Delegates to Preloader immediately.

### Preloader.ts

- Loads `sprite-{templateId}` textures for all units with `spriteSheet` config
- Loads `sprite-item-{itemId}` textures for items with sprites
- Starts MainMenu on completion

### MainMenu.ts

- Calls `GameState.initItemsIfNeeded()` — one-time item initialization
- "Play" button → Prep

### Prep.ts

- **Camp panel:** toggle units in/out of battle → writes `GameState.campUnitIds`
- **Party panel:** unit detail view with equipment slots, stats, skill info, shared backpack
- Item equip/unequip → writes `GameState.itemContainers` via `battle/itemOps`
- "Go to Battle" button → Game

### Game.ts

- **Placement phase:** bench panel, drag/drop/swap units on grid; validates with `canPlace()`
- **Battle phase:** initiative queue, per-turn targeting (manual / auto / quick), `resolveAttack()` / `resolveHeal()`, floating numbers, battle log
- **Game over:** victory levels up units, offers restart or exit; defeat offers restart
- Saves `playerUnitPlacements`, `playerBenchIds`, `playerUnitLevels`, `lastEnemyRace` to `GameState`

---

## Structural Role

```
scenes/ → orchestration layer (game flow, lifecycle, wiring)
```

---

## Data Flow

```
Preloader loads assets
↓
MainMenu initializes items in GameState
↓
Prep reads/writes GameState (camp, equipment)
↓
Game reads GameState → runs battle → writes results back to GameState
↓
Return to Prep (or restart Game)
```

---

## Key Dependencies

**scenes/ depends on:**

- `core/GameState` — central state read/write
- `core/EventBus` — emits `STATE_CHANGED` after every mutation
- `core/Constants` — layout values for UI construction
- `battle/*` — `autoPlace`, `placement`, `combat`, `targeting`, `initiative`, `itemOps`
- `data/unitDefinitions`, `data/itemDefinitions` — blueprints for display and placement
- `objects/*` — `CellView`, `UnitView`, `InitiativeBar`, `BattleLog`

**Depends on scenes/:**

- `main.ts` / `config.ts` — registers scene list with Phaser

---

## Critical Invariants

- `GameState.initItemsIfNeeded()` must be called before Prep; currently called in MainMenu
- Placement must always pass through `canPlace()` before committing
- `GameState.set()` must be called after every battle state mutation so EventBus can propagate
- Camp units (`campUnitIds`) must never appear on the field or bench during battle
- Level-up on victory must skip units in camp

---

## Where to Modify

| What to change                                | File                                                   |
| --------------------------------------------- | ------------------------------------------------------ |
| Add a new sprite asset type                   | `Preloader.ts`                                         |
| Change main menu layout or entry flow         | `MainMenu.ts`                                          |
| Add new equipment slots or prep UI panels     | `Prep.ts`                                              |
| Change item equip/unequip behavior            | `battle/itemOps.ts` (not here)                         |
| Change placement rules or bench behavior      | `Game.ts` (placement phase)                            |
| Change turn-order or combat resolution        | `battle/initiative.ts` / `battle/combat.ts` (not here) |
| Change game-over conditions or level-up logic | `Game.ts` (game-over handling)                         |
| Add a new battle mode                         | `Game.ts` + `battle/types.ts` + `core/GameState.ts`    |
