# objects

## Role
Game-specific visual components that know game data and render it using primitives from `src/ui/`. This layer bridges raw game state (units, skills, items, effects) and the screen — scenes compose from these objects rather than building UI directly.

## Responsibilities
- Render game entities (units, cells, skills, items, upgrades) as interactive Phaser containers
- Provide tooltip overlays tied to game data (stats, effects, skills, items)
- Manage hover/highlight/selection states for grid cells and skill bars
- Display auxiliary battle UI: turn order bar, event log, equipment grid, backpack
- Degrade gracefully when sprites are missing (rectangle or letter fallbacks)

## Key Files
- `UnitView.ts` — unit card in battle (sprite, HP bar, effect squares); key methods: `setSpriteState()`, `update()`
- `CellView.ts` — grid cell with hover, highlight, and skill/effect preview; key methods: `setMode()`, `setHighlight()`, `setSkillPreview()`
- `InitiativeBar.ts` — turn-order strip; dynamically sizes cards to viewport; key method: `update()`
- `BattleLog.ts` — collapsible event log; pre-allocates 20 text slots; key methods: `addEntry()`, `expand()`, `collapse()`
- `SkillBar.ts` — vertical skill toolbar with active highlight and tooltips
- `SkillIconRow.ts` — skill list with icons and `SkillCellTooltip` on hover
- `UpgradeCard.ts` — upgrade-choice card (three states: chosen / available / locked)
- `ItemCell.ts` — single equipment/backpack slot with tooltip; key method: `refresh()`
- `EquipmentMatrix.ts` — 4×3 equipment grid composed from `ItemCell`
- `BackpackRow.ts` — configurable inventory grid composed from `ItemCell`
- `UnitTooltip.ts` — multi-mode unit profile popup (stats, skills, bench snapshot)
- `EffectTooltip.ts` — popup for a single active effect
- `SkillTooltip.ts` — popup for skill name and damage type
- `SkillCellTooltip.ts` — extended skill popup with description and screen-clamped positioning
- `ItemTooltip.ts` — item stats and class-restriction popup

## Structural Role
`src/objects/` → game-aware visual components consumed by scenes

## Data Flow
`GamePhase` / `BattleState` snapshot data
↓
Component receives typed snapshot (Unit, ItemSlotSnapshot, SkillIconSnapshot, …)
↓
Renders Phaser primitives; shows tooltips on hover; fires callbacks on click
↓
Scene receives user interaction via callback — no state mutation here

## Dependencies
- depends on: `src/ui/` (BaseTooltip, HpBar, theme, primitives), `src/battle/types`, `src/core/Constants`, `src/core/phases`, `src/battle/combat` (effectiveStats), `src/core/unitSpriteKey`
- used by: scenes (`src/scenes/`)

## Invariants
- Components do not call `PhaseManager` or mutate game state — they only fire callbacks
- All tooltips extend `BaseTooltip` from `src/ui/`
- All sizing uses `LAYOUT_SCALE` from `src/core/Constants` — no raw pixel constants inside components
- Sprite absence must be handled with a visible fallback (rectangle or letter), never a crash
- `refresh()` / `update()` is the only path to change displayed data after construction

## Where to Modify
- change unit battle card appearance → `UnitView.ts`
- change grid cell colors or preview logic → `CellView.ts`
- change turn-order display → `InitiativeBar.ts`
- change battle log format or capacity → `BattleLog.ts`
- change skill bar layout or highlight → `SkillBar.ts`
- change upgrade card states or layout → `UpgradeCard.ts`
- change equipment slot visuals → `ItemCell.ts`, `EquipmentMatrix.ts`
- change backpack grid → `BackpackRow.ts`
- change unit stat tooltip → `UnitTooltip.ts`
- change effect/skill/item tooltip content → `EffectTooltip.ts`, `SkillTooltip.ts`, `SkillCellTooltip.ts`, `ItemTooltip.ts`
