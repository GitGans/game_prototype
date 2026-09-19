# objects

## Role

Game-specific visual components that know game data and render it using primitives from `src/ui/`. This layer bridges raw game state (units, skills, items, effects) and the screen — scenes compose from these objects rather than building UI directly.

## Responsibilities

- Render game entities (units, cells, skills, items, upgrades) as interactive Phaser containers
- Provide tooltip overlays tied to game data (stats, effects, skills, items)
- Manage hover/highlight/selection states for grid cells and skill bars
- Display auxiliary battle UI: turn order bar, event log, equipment grid, backpack
- Degrade gracefully when sprites are missing (rectangle or letter fallbacks)

## Presentation Builders

`objects/*Presentation.ts` files are pure formatting helpers. They accept typed snapshots, events, or directives and return structured display data.

Current files:
- `battleEventPresentation.ts` — formats battle events as floating-text and log entries
- `battleDirectivePresentation.ts` — formats `BattleDirectivePresentationInput` (from `shared/`) as status text and skill-bar visibility flags; owns all directive UI wording
- `battleSkillPreviewPresentation.ts` — `buildBattleTargetPreviewPresentation` formats every manual target-preview variant: skill previews (header color, damage/healing estimates) and the item-resurrection variant, whose sentence ("<target> revived +<hp> HP") is written HERE from structured data — the battle domain (`battle/itemPreview.ts`) computes only the target, restored HP and cells
- `itemUseEffectPresentation.ts` — formats consumable wording: the confirmation prompt, the tooltip effect line, and the blocked-reason line. An HP **boost** must state BOTH the permanent max-HP growth and the immediate heal; ordinary **healing** must state neither — it restores current HP only, and wording that implied growth would make a potion indistinguishable from an essence. The heal prompt reports `restoredHp` (already clamped by progression), never the item's nominal amount; the tooltip line is target-independent and says "up to"; a resurrection states its authored share ("Revives with 30% HP."). It also words every `BattleItemUseFailure`, including `no_valid_targets`, `item_not_selected` and `invalid_target"

Presentation builders:
- receive already-computed read models and presentation inputs from `shared/` or `core/`
- must NOT import battle runtime formulas, skill runtime helpers, turn resolvers, or skill preview resolvers
- display-only estimates and prompt classifications are produced by `core/` projections and passed in as data
- must not mutate state
- must not call `PhaseManager`
- must not own Phaser scene lifecycle

Applying presentation output to Phaser objects is the responsibility of `BattlePresentationController`.

## Key Files

- `battleVisualTheme.ts` — battle-flow visual tokens: cells, units, bench, skills, log, upgrade cards, unit portraits
- `worldMapVisualTheme.ts` — world-map cell visual tokens
- `itemVisualTheme.ts` — item cell and equipment slot visual tokens
- `prepVisualTheme.ts` — prep-screen action tile visual tokens
- `UnitView.ts` — unit card in battle (sprite, HP bar, effect squares); key methods: `setSpriteState()`, `update()`
- `CellView.ts` — grid cell with hover, highlight, and skill/effect preview; key methods: `setMode()`, `setHighlight()`, `setSkillPreview()`
- `InitiativeBar.ts` — turn-order strip; dynamically sizes cards to viewport; key method: `update()`
- `BattleLog.ts` — collapsible event log; pre-allocates 20 text slots; key methods: `addEntry()`, `expand()`, `collapse()`
- `SkillBar.ts` — vertical skill toolbar with active highlight and tooltips
- `SkillIconRow.ts` — skill list with icons and `SkillCellTooltip` on hover
- `UpgradeCard.ts` — upgrade-choice card (three states: chosen / available / locked)
- `ItemCell.ts` — single equipment/backpack slot with tooltip and click gestures; key methods: `refresh()`, `cancelPendingGesture()`
- `EquipmentMatrix.ts` — 4×3 equipment grid composed from `ItemCell`; receives `itemUsage` so the equipped usable's cell can explain its own eligibility
- `BackpackRow.ts` — configurable inventory grid composed from `ItemCell`
- `UnitTooltip.ts` — unified unit profile popup; renders any `BattleUnitSnapshot` regardless of side or field/bench state
- `EffectTooltip.ts` — popup for a single active effect
- `SkillTooltip.ts` — popup for skill name and damage type
- `SkillCellTooltip.ts` — extended skill popup with description and screen-clamped positioning
- `ItemTooltip.ts` — item stats, class-restriction and supplied `notes` lines. It RENDERS notes and composes none: eligibility travels the existing `EquipmentPanel → BackpackRow → ItemCell` data path and `ItemCell` composes the lines via `itemUseEffectPresentation.ts`
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

`GamePhase` snapshot data (read model)
↓
Component receives typed snapshot (`BattleUnitSnapshot`, `FieldBattleUnitSnapshot`, `ItemSlotSnapshot`, `SkillIconSnapshot`, …)
↓
Renders Phaser primitives; shows tooltips on hover; fires callbacks on click
↓
Scene receives user interaction via callback — no state mutation here

## Dependencies

- depends on: `src/ui/` (BaseTooltip, HpBar, theme, primitives), `src/shared/` (grid, unit, snapshot, item, skill contracts; battle snapshots), `src/core/Constants`, `src/core/phases`, `src/core/unitSpriteKey`
- used by: scenes (`src/scenes/`)

## Item presentation

- `itemUseEffectPresentation.ts` — wording for out-of-combat use (confirmation body, tooltip line,
  blocked reasons) plus `formatBattleItemActionTooltip` for the skill-bar item action, which
  states the two consequences the icon cannot show: the item is CONSUMED and the turn ENDS.
- `ItemCell.ts` gestures — a `usable` supports TWO of them (single click equips or unequips, double
  click opens the use confirmation), so its single click is DEFERRED by `DOUBLE_CLICK_WINDOW_MS`
  through the game-agnostic `ui/clickGesture` recognizer and exactly one callback fires per gesture.
  Every other kind stays immediate. `formatUsableGestureHint(origin)` supplies the tooltip line that
  advertises the second gesture — with the Use/Equip window gone nothing else does — and the verb
  follows the ORIGIN the usability entry already carries, never the cell's slot key.
- `SkillBar.ts` renders the entries the committed snapshot supplies (`BattleActionBarEntry`) and
  decides nothing about which exist or are enabled. A disabled item entry stays VISIBLE and
  dimmed — a recoverable "not yet" is information; an unsupported effect produces no entry at all,
  and that decision belongs to `battle/itemUsability`.

## Invariants

- `objects/*VisualTheme.ts` files must not import `UI_THEME` or any other `ui/` module
- objects/ components may use `UI_THEME` for generic primitives and text semantics
- objects/ components should use domain visual themes for game-specific presentation
- Components do not call `PhaseManager` or mutate game state — they only fire callbacks
- Overlay components (e.g. `BattleEndOverlay`) receive `outcome` and `isDebugBattle` as plain typed values — they never read `PhaseManager` or `GameState` internally; the scene resolves these and passes the results as constructor arguments
- All tooltips extend `BaseTooltip` from `src/ui/`
- All sizing uses `LAYOUT_SCALE` from `src/core/Constants` — no raw pixel constants inside components
- Sprite absence must be handled with a visible fallback (rectangle or letter), never a crash
- `refresh()` / `update()` is the only path to change displayed data after construction
- **A pending click gesture belongs to the committed snapshot under which its FIRST click occurred.**
  Deferring a click (see `ItemCell`) means an input can outlive the state it was made against, so
  every committed refresh cancels all pending gestures before rendering new data —
  `EquipmentPanel.refresh()` calls `cancelPendingGestures()` first, unconditionally and before its
  own early return, and destruction cancels them by destroying the cells. Comparing instance ids
  instead is **not** a sufficient substitute: `reset_debug_session` keeps the same phase and the same
  selected character and recreates the same authored instance ids, so nothing about the incoming data
  would reveal that the context changed. This cannot swallow the gesture that caused the refresh —
  the recognizer clears its pending state before invoking the callback that dispatches — nor break a
  double-click, since no transition occurs between its two clicks
- Stable structure (fixed number of children) → update via `update(snapshot)` or `refresh()`
- Variable structure (list length changes) → destroy and recreate the component
- Any UI pattern used in ≥2 places must be extracted into a component here or in `src/ui/`
- Domain-specific wording (battle event verbs, item rarity names, skill prompt phrasing) lives in `*Presentation.ts` builders or phase snapshots, not in components
- Components may compose pre-resolved values into local UI templates (e.g. `HP: 10 / 12`, section labels like "Stats" / "Skills")
- `ui/Panel.ts` is a game-agnostic background rectangle primitive. `objects/panels/*Panel.ts` are game-aware composite panel components that use `Panel` internally. The names share the word "panel" but operate at different abstraction levels.
- Presentation builders (`objects/*Presentation.ts`) must not import battle runtime formulas or helpers; they receive structured read models from `shared/` or `core/` and format them into strings and display flags

## Where to Modify

- change unit battle card appearance → `UnitView.ts`
- change grid cell colors or preview logic → `CellView.ts`
- change turn-order display → `InitiativeBar.ts`
- change battle log format or capacity → `BattleLog.ts`
- change skill bar layout or highlight → `SkillBar.ts`
- change upgrade card states or layout → `UpgradeCard.ts`
- change equipment slot visuals, or item click/double-click gestures → `ItemCell.ts`, `EquipmentMatrix.ts`
- change backpack grid → `BackpackRow.ts`
- change unit stat tooltip → `UnitTooltip.ts`
- change effect/skill/item tooltip content → `EffectTooltip.ts`, `SkillTooltip.ts`, `SkillCellTooltip.ts`, `ItemTooltip.ts`
