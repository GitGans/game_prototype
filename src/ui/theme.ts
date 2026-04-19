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
export const ALPHA = {
  active:   1.0,
  hover:    0.85,
  idle:     0.4,   // "waiting" buttons (skill, charge) before a turn starts
  disabled: 0.3,
} as const;

// ─── Tooltip ─────────────────────────────────────────────────────────────────
export const TOOLTIP = {
  bg:      0x0d1520,
  bgAlpha: 0.92,
  divider: 0x445566,
  pad:     Math.round(8  * LAYOUT_SCALE),
  lineH:   Math.round(17 * LAYOUT_SCALE),
  depth:   100,
} as const;

// ─── Semantic value colors ───────────────────────────────────────────────────
export const VALUE_COLOR = {
  positive:  "#44ff88",
  negative:  "#ff4444",
  neutral:   "#cccccc",
  highlight: "#ffdd44",
  white:     "#ffffff",
  muted:     "#aaaaaa",
} as const;
