import { LAYOUT_SCALE } from "../core/Constants";

// ─── Font sizes ───────────────────────────────────────────────────────────────
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

// ─── Private design tokens ────────────────────────────────────────────────────

const BUTTON = {
  primary: { base: 0x2a6a2a, hover: 0x3a8a3a },
  danger:  { base: 0x6a2a2a, hover: 0x8a3a3a },
  neutral: { base: 0x4a4a6a, hover: 0x6a6a8a },
  ghost:   { base: 0x334466, hover: 0x4455aa },
  navy:    { base: 0x2a2a6a, hover: 0x3a3a8a },
  dark:    { base: 0x444444, hover: 0x666666 },
} as const;

export type BtnStyle = keyof typeof BUTTON;

const ALPHA = {
  active:   1.0,
  hover:    0.85,
  idle:     0.4,
  disabled: 0.3,
} as const;

const TOOLTIP = {
  bg:      0x0d1520,
  bgAlpha: 0.92,
  divider: 0x445566,
  pad:     Math.round(8  * LAYOUT_SCALE),
  lineH:   Math.round(17 * LAYOUT_SCALE),
} as const;

const VALUE = {
  positive:  "#44ff88",
  negative:  "#ff4444",
  neutral:   "#cccccc",
  highlight: "#ffdd44",
  white:     "#ffffff",
  muted:     "#aaaaaa",
  inactive:  "#888888",
} as const;

const HP = {
  high:   0x44cc44,
  medium: 0xddaa00,
  low:    0xdd2222,
  bg:     0x333333,
} as const;

const BACKGROUND = {
  default: 0x1a1a2e,
  victory: 0x1a2e1a,
  panel:   0x222244,
} as const;

const PANEL = {
  bg: 0x222244,
} as const;

const CONTEXT_MENU = {
  bg:     0x1a1a2e,
  border: 0x445566,
} as const;

const NUMBER_INPUT = {
  bg:          0x222233,
  border:      0x6a6a8a,
  borderError: 0x8a3a3a,
  borderValid: 0x3a8a3a,
} as const;

const DEPTH = {
  scene:       0,
  panel:       10,
  overlay:     30,
  modal:       40,
  menu:        80,
  tooltip:     100,
  contextMenu: 200,
} as const;

const OVERLAY = {
  dim:      0x000000,
  dimAlpha: 0.72,
} as const;

const TEXT_STYLE = {
  titleStroke: '#000000',
} as const;

// ─── Public API ───────────────────────────────────────────────────────────────

export const UI_THEME = {
  font: {
    size: FONT_SIZE,
  },
  alpha: ALPHA,
  color: {
    value:      VALUE,
    hp:         HP,
    background: BACKGROUND,
    text:       TEXT_STYLE,
  },
  component: {
    button:      BUTTON,
    tooltip:     TOOLTIP,
    panel:       PANEL,
    overlay:     OVERLAY,
    contextMenu: CONTEXT_MENU,
    numberInput: NUMBER_INPUT,
  },
  depth: DEPTH,
} as const;
