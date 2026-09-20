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

- `theme.ts` — Generic UI/app design tokens exposed only through `UI_THEME`: fonts (`FONT_SIZE`, `fontSize()`), alpha states, depth layers, semantic text colors, screen backgrounds, and generic component tokens for button / tooltip / panel / overlay / modal / contextMenu / numberInput. Game-domain visual tokens live in `src/objects/*VisualTheme.ts`.
- `Button.ts` — Styled button with hover/idle/disabled states; exports `Button` and `ButtonConfig`
- `BaseTooltip.ts` — Abstract generic base for all tooltips; subclasses implement `buildContent(data)`
- `HpBar.ts` — Health bar with optional tri-color (green/yellow/red) mode
- `ContextMenu.ts` — Stacked button menu with outside-click dismissal
- `NumberInput.ts` — Keyboard number input with real-time min/max validation
- `clickGesture.ts` — `ClickGestureRecognizer` + `DOUBLE_CLICK_WINDOW_MS`: exclusive single/double click
  recognition for one interactive target. A single click is DEFERRED until the window closes, so a
  double-click emits only `onDouble` and exactly one callback fires per gesture. The scheduler is
  INJECTED (`GestureScheduler`), so the module imports no Phaser and its timing rules are unit-testable
  without a scene; the caller passes `scene.time.delayedCall`. Transient input state on a par with
  hover — never game state — and `cancel()` / `destroy()` exist because a deferred click must not
  outlive the state it was made against (see the gesture invariant in `src/objects/CLAUDE.md`)
- `layout.ts` — Scaling and layout helpers: `scaled()`, `centerX/Y()`, `stackY()`, `gridPosition()`, `rowItemCenterX()`
- `Panel.ts` — Background rectangle primitive with optional border; base surface for cards and overlays
- `ModalFrame.ts` — Shared modal framing and the single owner of modal dismissal: scrim, centred `Panel`, optional `✕` close icon, optional footer button row, reserved content band, one-shot teardown. Exports `ModalFrame`, `ModalDismissOptions`, `ModalDismissReason`, `ModalAction`, `modalContentWidth()` — see **Modals**
- `ConfirmationDialog.ts` — Message plus one confirm action, built on `ModalFrame`; owns only the message text and its wrapping

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

## Modals

- `ModalFrame.ts` is the shared modal framing AND the single owner of modal dismissal: a
  full-screen input-blocking scrim, a centred `Panel` with its own hit area, an optional `✕` close
  icon, an optional footer row (dismissal button first, then `actions`), a content band that cannot
  overlap either, one-shot idempotent teardown, and **teardown-before-callback** resolution.
- Three distinct exits: `onDismiss` (the user backed out), `resolve()` (a successful action such as
  confirmation or target selection, used by `ModalAction.onSelect`), and `destroy()` (silent
  teardown for scene reconciliation — invokes no callback).
- Four independently configurable routes — `dismiss.backdrop`, `dismiss.closeIcon`,
  `dismiss.button`, `dismiss.escape` — all funnel through one internal `dismiss(reason)` into
  `onDismiss(reason: ModalDismissReason)`, whose union is
  `'backdrop' | 'close_icon' | 'button' | 'escape'`. Every route is stated explicitly at the
  construction site; there are no defaults.
- Load-bearing behaviours, not defensive style: the scrim is interactive EVEN WHEN
  `dismiss.backdrop` is false, so background input is blocked rather than forwarded; the panel's
  dedicated hit area stops an inside click falling through to the scrim; the one-shot `done` guard
  means overlapping input can fire at most one callback; teardown precedes every callback, so a
  scene reconciler that destroys a modal in response to committed state can never fire an action
  while doing so.
  `dismiss.escape` registers a frame-owned listener on the scene keyboard plugin's ESC `Key` — not
  a `keydown-ESC` plugin listener — because Phaser runs `Key` handlers before the plugin's
  `keydown-ESC` and `keydown` emits. The handler calls `stopPropagation()`, not
  `stopImmediatePropagation()`: Phaser resets the latter's flag after each event so other active
  Scenes still receive the key, while `stopPropagation()` makes every later keyboard plugin skip
  it. The key is added with capture disabled, so no browser-level `preventDefault` outlives the
  modal. The listener is removed in `teardown()`, i.e. on every exit including silent `destroy()`,
  and the shared plugin-owned `Key` itself is never removed or destroyed.
- While an Escape-enabled modal is open, modal dismissal OWNS the Escape key. Phaser cannot order
  listeners attached directly to the same shared `Key`, so a component that can coexist with such a
  modal must not register its own behaviour on the ESC `Key`; scene-level `keydown-ESC` / `keydown`
  handlers are fine and are correctly suppressed.
- Sizing: every modal dimension is a pre-scaled token in `UI_THEME.component.modal` — the frame
  declares none. The caller passes panel `width` and its own `contentHeight`;
  `modalContentWidth(width)` gives the wrap width to measure against first. The frame adds padding
  and header/footer reserves and exposes `contentCenterX/Y`, `contentWidth/Height`, `contentDepth`.
- A new modal supplies content plus `actions` through `ModalFrame`; it does not re-roll the scrim,
  the close icon, or the footer row.
- `ContextMenu.ts` is a different component (anchored, pass-through dismissal) and is unrelated
  to this frame.

## Invariants

- No imports from `src/core/GameState`, `src/battle/`, `src/objects/`, or `src/scenes/`
- No calls to `PhaseManager` or any transition logic
- All colors and font sizes must come from `theme.ts` — no hardcoded values in components
- New and migrated UI code must use `UI_THEME.depth` for z-order values
- `*VisualTheme.ts` files in `src/objects/` must not import from `ui/theme`
- Components are stateless regarding game data — they receive data via config and emit events via callbacks
- `BaseTooltip` subclasses must only override `buildContent()` and use `addText`/`addRect` helpers
- Texts are always plain strings — no label keys or translation IDs in primitives
- New file in `ui/` must have zero game-domain knowledge; when in doubt → `src/objects/`

## Where to Modify

- change button colors or styles → `theme.ts` (`UI_THEME.component.button`, `BtnStyle`)
- change font sizes → `theme.ts` (`FONT_SIZE`, `fontSize()`)
- change health bar colors → `theme.ts` (`UI_THEME.color.hp`)
- change tooltip background/padding → `theme.ts` (`UI_THEME.component.tooltip`)
- change alpha states → `theme.ts` (`UI_THEME.alpha`)
- change scene background colors → `theme.ts` (`UI_THEME.color.background`)
- change semantic value text colors → `theme.ts` (`UI_THEME.color.value`)
- change button behavior (hover, disabled, idle) → `Button.ts`
- add a new tooltip type → extend `BaseTooltip` in `src/objects/`
- change health bar color thresholds → `HpBar.ts` (`setRatio`)
- change modal dismissal routes or footer composition → `ModalFrame.ts`
- change modal padding, close-icon size, or button dimensions → `theme.ts` (`UI_THEME.component.modal`)
- change context menu layout or dismissal → `ContextMenu.ts`
- change number input validation → `NumberInput.ts`
- change the double-click window or single/double click recognition → `clickGesture.ts`
- change z-order of any layer → `theme.ts` (`DEPTH`)
- change overlay dim color/alpha → `theme.ts` (`OVERLAY`)
- add a row layout calculation → `layout.ts` (`rowItemCenterX`)
