# ui

## Role
Reusable Phaser-based UI component library. Provides themeable styling primitives, interactive controls, and tooltip infrastructure shared across all scenes and display objects.

## Responsibilities
- Centralizes all color, typography, spacing, and alpha constants into a single theme
- Provides interactive button controls with idle/disabled/hover state management
- Provides an abstract base class for data-driven, positioned tooltips
- Provides dismissible context menus built from buttons
- Scales all layout values via `LAYOUT_SCALE` at the component level

## Key Files
- `theme.ts` — All UI constants: colors (`BTN`, `ALPHA`, `VALUE_COLOR`), typography (`FONT_SIZE`, `fontSize()`), tooltip spacing (`TOOLTIP`)
- `Button.ts` — Clickable button with label, style, and state; configures via `ButtonConfig`
- `BaseTooltip.ts` — Abstract base for positioned tooltips; subclasses implement `buildContent()`
- `ContextMenu.ts` — Dismissible option list (panel + overlay); configured via `ContextMenuConfig`

## Structural Role
`ui/` → styling and control primitives consumed by `src/objects/` and `src/scenes/`

## Data Flow
Scene or object instantiates a UI component with config + callbacks
↓
Component renders itself via Phaser GameObjects, scaled by LAYOUT_SCALE
↓
User interaction triggers callback (onClick, onDismiss) — caller owns business logic
↓
Component updates its own visual state only

## Dependencies
- depends on: `core/Constants.ts` (LAYOUT_SCALE), `Phaser`
- used by: `src/objects/` (tooltips, ItemCell), `src/scenes/` (Button, ContextMenu, theme)

## Invariants
- All colors, sizes, and spacing must come from `theme.ts` — no hardcoded values in component files
- `ui/` contains no game logic, no `GameState` access, and no scene orchestration
- Callbacks accept events but never implement business logic — delegate to callers
- `BaseTooltip` subclasses must only populate `this.contentItems` inside `buildContent()`; the base class clears them
- All pixel values must be multiplied by `LAYOUT_SCALE`; raw constants live in `theme.ts` only

## Where to Modify
- change button colors or alpha → `theme.ts` (`BTN`, `ALPHA`)
- change font sizes → `theme.ts` (`FONT_SIZE`, `fontSize()`)
- change tooltip padding or layout → `theme.ts` (`TOOLTIP`)
- change button behavior or states → `Button.ts`
- add a new reusable tooltip type → extend `BaseTooltip` in `src/objects/`
- change context menu layout or dismiss behavior → `ContextMenu.ts`
