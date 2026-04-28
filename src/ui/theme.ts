import { LAYOUT_SCALE } from "../core/Constants";

// ─── Font sizes (raw px before scale) ───────────────────────────────────────
export const FONT_SIZE = {
  xs:  10,
  sm:  11,
  md:  13,
  lg:  18,
  xl:  26,
  xxl: 32,
  h1:  52,
  h2:  64,
} as const;

/** Returns a CSS font-size string ready for Phaser text style. */
export function fontSize(key: keyof typeof FONT_SIZE): string {
  return `${Math.round(FONT_SIZE[key] * LAYOUT_SCALE)}px`;
}

// ─── Button colors ───────────────────────────────────────────────────────────
/** @deprecated Migration bridge. Use UI_THEME.component.button in new code. Remove in Stage 7. */
export const BTN = {
  primary: { base: 0x2a6a2a, hover: 0x3a8a3a },  // green — main actions
  danger:  { base: 0x6a2a2a, hover: 0x8a3a3a },  // red — destructive / defeat
  neutral: { base: 0x4a4a6a, hover: 0x6a6a8a },  // purple-gray — secondary
  ghost:   { base: 0x334466, hover: 0x4455aa },  // subtle — list rows
  navy:    { base: 0x2a2a6a, hover: 0x3a3a8a },  // dark blue — navigation
  dark:    { base: 0x444444, hover: 0x666666 },  // dark gray — debug/disabled
} as const;

export type BtnStyle = keyof typeof BTN;

// ─── Alpha states ────────────────────────────────────────────────────────────
/** @deprecated Migration bridge. Use UI_THEME.alpha in new code. Remove in Stage 7. */
export const ALPHA = {
  active:   1.0,
  hover:    0.85,
  idle:     0.4,   // "waiting" buttons (skill, charge) before a turn starts
  disabled: 0.3,
} as const;

// ─── Tooltip ─────────────────────────────────────────────────────────────────
/** @deprecated Migration bridge. Use UI_THEME.component.tooltip in new code. Remove in Stage 7. */
export const TOOLTIP = {
  bg:      0x0d1520,
  bgAlpha: 0.92,
  divider: 0x445566,
  pad:     Math.round(8  * LAYOUT_SCALE),
  lineH:   Math.round(17 * LAYOUT_SCALE),
  depth:   100,
} as const;

// ─── Semantic value colors ───────────────────────────────────────────────────
/** @deprecated Migration bridge. Use UI_THEME.color.value in new code. Remove in Stage 7. */
export const VALUE_COLOR = {
  positive:  "#44ff88",
  negative:  "#ff4444",
  neutral:   "#cccccc",
  highlight: "#ffdd44",
  white:     "#ffffff",
  muted:     "#aaaaaa",
  inactive:  "#888888",
} as const;

// ─── HP bar fill colors ───────────────────────────────────────────────────────
/** @deprecated Migration bridge. Use UI_THEME.color.hp in new code. Remove in Stage 7. */
export const HP_COLOR = {
  high:   0x44cc44,  // > 50%
  medium: 0xddaa00,  // 25–50%
  low:    0xdd2222,  // < 25%
  bg:     0x333333,
} as const;


// ─── Scene backgrounds ───────────────────────────────────────────────────────
/** @deprecated Migration bridge. Use UI_THEME.color.background in new code. Remove in Stage 7. */
export const SCENE_BG = {
  default: 0x1a1a2e,
  victory: 0x1a2e1a,
  panel:   0x222244,
} as const;


// ─── Panel ───────────────────────────────────────────────────────────────────
const PANEL = {
  bg: 0x222244,   // matches SCENE_BG.panel — dark navy surface
} as const;

// ─── Context menu ─────────────────────────────────────────────────────────────
const CONTEXT_MENU = {
  bg:     0x1a1a2e,
  border: 0x445566,
} as const;

// ─── Number input ─────────────────────────────────────────────────────────────
const NUMBER_INPUT = {
  bg:          0x222233,
  border:      0x6a6a8a,
  borderError: 0x8a3a3a,
  borderValid: 0x3a8a3a,
} as const;

// ─── Z-order depth layers ────────────────────────────────────────────────────
// New and migrated code must use these values. Legacy hardcoded depths are
// migration debt tracked for removal in Stage 8.
const DEPTH = {
  scene:   0,             // scene background elements
  panel:   10,            // in-scene panels and cards
  overlay: 30,            // fullscreen dim overlays (battle end, confirm)
  modal:   40,            // floating modals above overlays
  menu:    80,            // context menus, dropdowns
  tooltip:     TOOLTIP.depth, // 100 — single source; TOOLTIP.depth is a legacy bridge until Stage 7
  contextMenu: 200,
} as const;

// ─── Overlay dim ─────────────────────────────────────────────────────────────
const OVERLAY = {
  dim:      0x000000,
  dimAlpha: 0.72,
} as const;

// ─── Text style ──────────────────────────────────────────────────────────────
const TEXT_STYLE = {
  titleStroke: '#000000',
} as const;

// ─── Structured entry point for new code ────────────────────────────────────
// References existing objects — no value duplication.
// Old flat exports above are @deprecated bridges; removed in Stage 7.
export const UI_THEME = {
  font: {
    size: FONT_SIZE,
  },
  alpha: ALPHA,
  color: {
    value:      VALUE_COLOR,
    hp:         HP_COLOR,
    background: SCENE_BG,
    text:       TEXT_STYLE,
  },
  component: {
    button:      BTN,
    tooltip:     TOOLTIP,
    panel:       PANEL,
    overlay:     OVERLAY,
    contextMenu: CONTEXT_MENU,
    numberInput: NUMBER_INPUT,
  },
  depth: DEPTH,
} as const;
