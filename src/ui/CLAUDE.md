# ui

## Role

Game-agnostic UI primitive library. Provides reusable visual components and design tokens with no knowledge of game state, phases, or rules.

## Responsibilities

- Define all visual design tokens (colors, sizes, opacity states) in one place
- Provide interactive primitives: buttons, menus, inputs, health bars
- Supply a base class for all tooltips with positioning and lifecycle management
- Enforce consistent visual feedback (hover, idle, disabled, validation states)
- Serve as the only source of UI style constants for the rest of the codebase

## Key Files

- `theme.ts` — All design tokens: `BTN`, `FONT_SIZE`, `ALPHA`, `VALUE_COLOR`, `HP_COLOR`, `TOOLTIP`, and scene/map palettes
- `Button.ts` — Styled button with hover/idle/disabled states; exports `Button` and `ButtonConfig`
- `BaseTooltip.ts` — Abstract generic base for all tooltips; subclasses implement `buildContent(data)`
- `HpBar.ts` — Health bar with optional tri-color (green/yellow/red) mode
- `ContextMenu.ts` — Stacked button menu with outside-click dismissal
- `NumberInput.ts` — Keyboard number input with real-time min/max validation
- `layout.ts` — Scaling and layout helpers: `scaled()`, `centerX/Y()`, `stackY()`, `gridPosition()`, `rowItemCenterX()`
- `Panel.ts` — Background rectangle primitive with optional border; base surface for cards and overlays

## Structural Role

`src/ui/` → game-agnostic primitive layer consumed by `src/objects/` and `src/scenes/`

## Data Flow

caller provides config (scene, position, data, callbacks)
↓
component renders Phaser GameObjects internally
↓
user interaction triggers provided callbacks
↓
caller manages state changes and re-renders

## Dependencies

- depends on: Phaser (GameObjects, Scene), `src/core/Constants.ts` (layout scale)
- used by: `src/objects/` (game-specific visuals), `src/scenes/` (composition)

## Invariants

- No imports from `src/core/GameState`, `src/battle/`, `src/objects/`, or `src/scenes/`
- No calls to `PhaseManager` or any transition logic
- All colors and font sizes must come from `theme.ts` — no hardcoded values in components
- New and migrated UI code must use `UI_THEME.depth` for z-order values. Legacy hardcoded depths elsewhere are migration debt tracked for removal in Stage 8.
- Components are stateless regarding game data — they receive data via config and emit events via callbacks
- `BaseTooltip` subclasses must only override `buildContent()` and use `addText`/`addRect` helpers
- Texts are always plain strings — no label keys or translation IDs in primitives
- New file in `ui/` must have zero game-domain knowledge; when in doubt → `src/objects/`

## Where to Modify

- change button colors or styles → `theme.ts` (`BTN`, `BtnStyle`)
- change font sizes → `theme.ts` (`FONT_SIZE`, `fontSize()`)
- change health bar colors → `theme.ts` (`HP_COLOR`)
- change tooltip background/padding/depth → `theme.ts` (`TOOLTIP`)
- change button behavior (hover, disabled, idle) → `Button.ts`
- add a new tooltip type → extend `BaseTooltip` in `src/objects/`
- change health bar color thresholds → `HpBar.ts` (`setRatio`)
- change context menu layout or dismissal → `ContextMenu.ts`
- change number input validation → `NumberInput.ts`
- change z-order of any layer → `theme.ts` (`DEPTH`)
- change overlay dim color/alpha → `theme.ts` (`OVERLAY`)
- add a row layout calculation → `layout.ts` (`rowItemCenterX`)
