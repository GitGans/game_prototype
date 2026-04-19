# objects/

## Role

UI rendering layer for battle visuals. Contains Phaser display components that show game state without modifying it. All objects are created and driven by `scenes/Game.ts`.

---

## Responsibilities

- Render individual grid cells with interaction highlights and skill previews
- Display unit sprites, HP bars, and death state on the grid
- Show the turn order queue (current and next round)
- Display a collapsible battle event log

---

## Key Files

| File               | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| `CellView.ts`      | Single grid cell — highlight, hover, skill AoE preview     |
| `UnitView.ts`      | Unit on the grid — sprite or fallback, HP bar, death state |
| `InitiativeBar.ts` | Turn order timeline — current and next round cards         |
| `BattleLog.ts`     | Collapsible battle event log                               |

### CellView.ts

- `setHighlight(type)` — colors cell for `"selected"`, `"target"`, `"heal_target"`, `"none"`
- `setHover(on)` — hover tint on/off
- `setSkillPreview(multiplier, isHeal?)` — tints cell by AoE damage/heal weight

### UnitView.ts

- `update(unit)` — refreshes HP bar and handles death visuals
- `setSpriteState(state: SpriteState)` — switches sprite frame (`"idle"`, `"attack"`, `"death"`)

### InitiativeBar.ts

- `update(state: BattleState)` — fully rebuilds the timeline from current state

### BattleLog.ts

- `addEntry(text, type)` — appends a log line; `type`: `"positive"`, `"negative"`, `"neutral"`
- Toggles between collapsed (last entry only) and expanded (up to 20 entries) on click

---

## Structural Role

```
objects/ → UI rendering layer (view only, no state mutation)
```

---

## Data Flow

```
BattleState changes in Game.ts
↓
Game.ts calls refreshUI()
↓
CellView.setHighlight() / UnitView.update() / InitiativeBar.update()
↓
Visual update rendered by Phaser
```

---

## Key Dependencies

**objects/ depends on:**

- `phaser` — base classes (`Container`, `Rectangle`, `Image`, `Text`)
- `core/Constants` — `CELL_SIZE`, `CELL_GAP`, `COLORS`, `LAYOUT_SCALE`
- `battle/types` — `CellCoord`, `Unit`, `BattleState`, `SpriteState`, `SpriteSheetConfig`
- `battle/field` — `cellKey()` (used in `CellView`)

**Depends on objects/:**

- `scenes/Game.ts` — sole consumer; creates, updates, and destroys all instances

---

## Critical Invariants

- Objects must never mutate `BattleState` — read only
- `UnitView.setSpriteState()` must be a no-op when the unit is already dead (except for `"death"`)
- `InitiativeBar.update()` must handle `phase === "end"` without rendering
- `BattleLog` entries are append-only — no editing or removing past entries

---

## Where to Modify

| What to change                             | File                                |
| ------------------------------------------ | ----------------------------------- |
| Cell highlight colors or hover behavior    | `CellView.ts`                       |
| Skill AoE color lerp                       | `CellView.ts` → `setSkillPreview()` |
| Unit HP bar thresholds or colors           | `UnitView.ts` → `update()`          |
| Sprite frame switching logic               | `UnitView.ts` → `setSpriteState()`  |
| Turn order card layout or next-round logic | `InitiativeBar.ts` → `update()`     |
| Battle log max lines or entry colors       | `BattleLog.ts`                      |
