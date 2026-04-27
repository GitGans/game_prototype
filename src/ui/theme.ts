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

// ─── BattleLog colors (lighter palette, intentionally distinct) ───────────────
/** @deprecated Migration bridge. Use UI_THEME.component.battleLog in new code. Remove in Stage 7. */
export const BATTLE_LOG = {
  bg:       0xd8d8d8,
  positive: "#1a8c1a",
  negative: "#aa2222",
  neutral:  "#555555",
  btn:      "#333333",
} as const;

// ─── ItemCell slot background ────────────────────────────────────────────────
/** @deprecated Migration bridge. Use UI_THEME.component.itemCell in new code. Remove in Stage 7. */
export const ITEM_CELL = {
  bg:          0x2a2a3a,
  hoverBorder: 0xffffff,
  emptySlot:   "#555566",
} as const;

// ─── Scene backgrounds ───────────────────────────────────────────────────────
/** @deprecated Migration bridge. Use UI_THEME.color.background in new code. Remove in Stage 7. */
export const SCENE_BG = {
  default: 0x1a1a2e,
  victory: 0x1a2e1a,
  panel:   0x222244,
} as const;

// ─── WorldMap cell type colors ───────────────────────────────────────────────
/** @deprecated Migration bridge. Use UI_THEME.component.worldMapCell in new code. Remove in Stage 7. */
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
/** @deprecated Migration bridge. Use UI_THEME.component.initiative in new code. Remove in Stage 7. */
export const INITIATIVE = {
  divider: 0x8899bb,
} as const;

// ─── Panel ───────────────────────────────────────────────────────────────────
const PANEL = {
  bg: 0x222244,   // matches SCENE_BG.panel — dark navy surface
} as const;

// ─── Battle result card ───────────────────────────────────────────────────────
const RESULT_CARD = {
  bg:       0x1a1a2e,  // dark navy card background
  border:   0x44445a,  // subtle blue-gray border
  fallback: 0x556677,  // placeholder when sprite is missing
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
  tooltip: TOOLTIP.depth, // 100 — single source; TOOLTIP.depth is a legacy bridge until Stage 7
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

// ─── Battle end overlay ───────────────────────────────────────────────────────
// References VALUE_COLOR — no value duplication.
const BATTLE_END_OVERLAY = {
  titleVictory: VALUE_COLOR.highlight, // '#ffdd44' gold
  titleDefeat:  VALUE_COLOR.negative,  // '#ff4444' red
  titleStroke:  TEXT_STYLE.titleStroke,
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
    button:           BTN,
    tooltip:          TOOLTIP,
    itemCell:         ITEM_CELL,
    battleLog:        BATTLE_LOG,
    worldMapCell:     WORLD_MAP_CELL,
    initiative:       INITIATIVE,
    panel:            PANEL,
    resultCard:       RESULT_CARD,
    overlay:          OVERLAY,
    battleEndOverlay: BATTLE_END_OVERLAY,
  },
  depth: DEPTH,
} as const;
