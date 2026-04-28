export const LAYOUT_SCALE = Math.min(
  window.innerWidth / 900,
  window.innerHeight / 500,
);

export const CELL_SIZE = Math.round(126 * LAYOUT_SCALE);
export const CELL_GAP = 0;
export const GRID_COLS = 3;
export const GRID_ROWS = 2;
export const SIDE_GAP = Math.round(40 * LAYOUT_SCALE); // horizontal gap between the two grids
export const BENCH_PANEL_WIDTH = CELL_SIZE;
export const BENCH_GAP = Math.round(10 * LAYOUT_SCALE);
export const BENCH_SLOTS = 3;

/**
 * @deprecated UI/style colors belong in src/ui/theme.ts.
 * Migrate to UI_THEME during Stage 2–6 as each scene is refactored.
 */
export const COLORS = {
  cell: 0x2a3a5a,
  cellBorder: 0x2a3f60,
  cellHover: 0x3a5a8a,
  cellSelected: 0xffaa00,
  validTarget: 0xff4444,
  unitPlayer: 0x4488ff,
  unitEnemy: 0xff5544,
  unitDead: 0x333344,
  hpBarBg: 0x222233,
  hpBarFg: 0x44dd44,
  validHeal: 0x44dd44,
  textLight: "#ffffff",
  textDark: "#cccccc",
  label: "#aaddff",
  labelEnemy: "#ffaaaa",
  bench: 0x1a2a3a,
  benchHover: 0x2a3a4a,
  benchSelected: 0x2a5a1a,
  benchBorder: 0x3a5a7a,
  benchEmpty: 0x0d1a26,
  skillMagical: "#89CFF0",
  skillPhysical: "#B0C4DE",
};

export const DAMAGE = 10;
export const HEAL_AMOUNT = 10;
