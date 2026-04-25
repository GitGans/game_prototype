# ui

## Role
Game-agnostic UI component library and design system. Provides reusable primitives — buttons, tooltips, health bars, inputs — and centralized styling constants. Has no knowledge of game rules or state.

## Responsibilities
- Define all visual design tokens (colors, fonts, alpha levels) in one place
- Provide interactive primitive components (buttons, context menus, inputs)
- Provide a base class for all tooltips
- Ensure consistent styling across scenes and objects without duplication

## Key Files
- `theme.ts` — all style constants: `FONT_SIZE`, `BTN`, `ALPHA`, `TOOLTIP`, `VALUE_COLOR`, `HP_COLOR`, `SCENE_BG`, etc.
- `Button.ts` — interactive button with hover/disabled/idle states; configurable via `BtnStyle`
- `BaseTooltip.ts` — abstract base for tooltips; handles show/hide, auto-positioning, content cleanup
- `HpBar.ts` — health bar with tricolor (green/yellow/red) or fixed-color mode
- `ContextMenu.ts` — right-click menu composed of `Button` items with dismiss overlay
- `NumberInput.ts` — keyboard number input with min/max validation and visual feedback
- `UnitCampButton.ts` — toggle button for camp/party state, wraps `Button`

## Structural Role
ui → shared primitive layer consumed by `src/objects/` and `src/scenes/`

## Data Flow
config/props passed at construction
↓
component renders via Phaser GameObjects
↓
user interaction triggers callbacks
↓
parent (scene or object) handles game logic

## Dependencies
- depends on: Phaser (rendering), `src/core/Constants.ts` (layout scale)
- used by: all `src/scenes/` and all `src/objects/`

## Invariants
- No imports from `src/objects/`, `src/scenes/`, `src/battle/`, or `src/core/GameState`
- No access to `PhaseManager` or game state
- All colors and font sizes must come from `theme.ts` — never hardcoded inline
- `BaseTooltip` subclasses live in `src/objects/`, not here

## Where to Modify
- change colors or font sizes → `theme.ts`
- change button appearance or behavior → `Button.ts`
- change tooltip base positioning or lifecycle → `BaseTooltip.ts`
- change health bar rendering → `HpBar.ts`
- change context menu layout → `ContextMenu.ts`
- add a new reusable primitive → new file here, no game logic
