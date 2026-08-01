// Falls back to the design-reference viewport when there is no `window` — this
// module also holds gameplay constants (BENCH_SLOTS, grid dimensions) that pure
// domain code imports, so loading it must not require a browser environment.
export const LAYOUT_SCALE = typeof window === 'undefined'
  ? 1
  : Math.min(window.innerWidth / 900, window.innerHeight / 500);

export const CELL_SIZE = Math.round(126 * LAYOUT_SCALE);
export const CELL_GAP = 0;
export const GRID_COLS = 3;
export const GRID_ROWS = 2;
export const SIDE_GAP = Math.round(40 * LAYOUT_SCALE); // horizontal gap between the two grids
export const BENCH_PANEL_WIDTH = CELL_SIZE;
export const BENCH_GAP = Math.round(10 * LAYOUT_SCALE);
export const BENCH_SLOTS = 3;

export const DAMAGE = 10;
export const HEAL_AMOUNT = 10;
