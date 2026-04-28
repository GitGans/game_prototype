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
- `UnitCampButton.ts` — camp/party toggle button placed on unit portraits; built on `Button`
- `BattleResultUnitCard.ts` — post-battle unit card (sprite, name, level); built on `Panel`
- `BattleEndOverlay.ts` — victory/defeat overlay composed from `Panel` + `Button`; receives outcome, isDebugBattle, labels, and callbacks; never reads `GameState` or calls `PhaseManager`
- `UnitPortrait.ts` — sprite-or-fallback portrait with optional name label and click handler; supports dimmed/selected states; used in selection grids and tab rows
- `UnitTabRow.ts` — horizontal row of clickable unit tabs at the top of the character equip menu; plain class (not Container), tracks portraits for `destroy()`
- `panels/CampPanel.ts` — camp roster panel; title, unit rows, toggle-to-party buttons; built on `Panel` + `Button`
- `panels/PartyPanel.ts` — active party panel; title, hoverable unit rows with equip callback; built on `Panel`
- `panels/UnitSelectionPanel.ts` — full unit selection grid with portrait layout, debug camp toggles, and go-to-battle trigger; extends Container at (0,0)
- `panels/EquipmentPanel.ts` — character menu layout composing stats, equipment matrix, sprite, skills, and backpack; plain class (not Container) due to UnitTooltip absolute positioning; exposes `refresh(phase)` and `destroy()`

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
- Overlay components (e.g. `BattleEndOverlay`) receive `outcome` and `isDebugBattle` as plain typed values — they never read `PhaseManager` or `GameState` internally; the scene resolves these and passes the results as constructor arguments
- All tooltips extend `BaseTooltip` from `src/ui/`
- All sizing uses `LAYOUT_SCALE` from `src/core/Constants` — no raw pixel constants inside components
- Sprite absence must be handled with a visible fallback (rectangle or letter), never a crash
- `refresh()` / `update()` is the only path to change displayed data after construction
- Stable structure (fixed number of children) → update via `update(snapshot)` or `refresh()`
- Variable structure (list length changes) → destroy and recreate the component
- Any UI pattern used in ≥2 places must be extracted into a component here or in `src/ui/`
- Texts are passed as plain strings from phase snapshots — no formatting logic inside components
- `ui/Panel.ts` is a game-agnostic background rectangle primitive. `objects/panels/*Panel.ts` are game-aware composite panel components that use `Panel` internally. The names share the word "panel" but operate at different abstraction levels.

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
