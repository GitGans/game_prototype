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
  inactive:  "#888888",
} as const;

// ─── HP bar fill colors ───────────────────────────────────────────────────────
export const HP_COLOR = {
  high:   0x44cc44,  // > 50%
  medium: 0xddaa00,  // 25–50%
  low:    0xdd2222,  // < 25%
  bg:     0x333333,
} as const;

// ─── Skill preview overlay colors ────────────────────────────────────────────
export const SKILL_PREVIEW = {
  healDim:      0x0a2a0a,
  healBright:   0x44dd44,
  damageDim:    0x2a1a00,
  damageBright: 0xff8800,
} as const;

// ─── BattleLog colors (lighter palette, intentionally distinct) ───────────────
export const BATTLE_LOG = {
  bg:       0xd8d8d8,
  positive: "#1a8c1a",
  negative: "#aa2222",
  neutral:  "#555555",
  btn:      "#333333",
} as const;

// ─── ItemCell slot background ────────────────────────────────────────────────
export const ITEM_CELL = {
  bg:          0x2a2a3a,
  hoverBorder: 0xffffff,
  emptySlot:   "#555566",
} as const;

// ─── Scene backgrounds ───────────────────────────────────────────────────────
export const SCENE_BG = {
  default: 0x1a1a2e,
  victory: 0x1a2e1a,
  panel:   0x222244,
} as const;

// ─── WorldMap cell type colors ───────────────────────────────────────────────
export const WORLD_MAP_CELL = {
  empty:    0x555555,
  forest:   0x4a7c3f,
  enemy:    0xcc3333,
  camp:     0xcc9933,
  town:     0x3355cc,
  dungeon:  0x9933cc,
  start:    0xffffff,
  fog:      0x888888,
  party:    0x4488ff,
} as const;

// ─── Initiative bar ──────────────────────────────────────────────────────────
export const INITIATIVE = {
  divider: 0x8899bb,
} as const;
