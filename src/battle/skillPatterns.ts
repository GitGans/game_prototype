import {
  CellCoord,
  Col,
  PatternCell,
  ResolvedHitCell,
  Row,
  SkillPattern,
} from "./types";

// ─── Helper ───────────────────────────────────────────────────────────────

const P = (m: number): PatternCell => ({ damageMultiplier: m });

// ─── Named Pattern Presets ────────────────────────────────────────────────

export const PATTERNS: Record<string, SkillPattern> = {
  /** Hits only the selected cell at 100% damage. Default for all basic attacks. */
  single: {
    anchorRow: 0,
    anchorCol: 0,
    cells: [[P(1.0)]],
  },

  /**
   * Hits the selected cell and its 4 orthogonal neighbours.
   * All 5 cells take 100% damage.
   * Grid is 2 rows × 3 cols, so row/col offsets outside bounds are silently clipped.
   *
   *   [ ]  [X]  [ ]
   *   [X]  [X]  [X]   ← anchor at center (row 1, col 1)
   *   [ ]  [X]  [ ]
   */
  cross: {
    anchorRow: 1,
    anchorCol: 1,
    cells: [
      [null, P(0.5), null],
      [P(0.1), P(1.0), P(0.5)],
      [null, P(0.1), null],
    ],
  },

  /**
   * Hits all 3 cells in the same row as the target.
   * Anchor at col 1 (middle) so the full row is always covered.
   *
   *   [X]  [X]  [X]   ← anchor at col 1
   */
  row_sweep: {
    anchorRow: 0,
    anchorCol: 1,
    cells: [[P(1.0), P(1.0), P(1.0)]],
  },

  /**
   * Hits the target cell at 100% and the adjacent cell (higher col) at 50%.
   *
   *   [X 100%]  [X 50%]
   */
  pierce: {
    anchorRow: 0,
    anchorCol: 0,
    cells: [
      [P(1.0)], // row 0 — цель, 100%
      [P(0.5)], // row 1 — вторая строка той же колонки, 50%
    ],
  },
};

// ─── Resolve Function ─────────────────────────────────────────────────────

/**
 * Converts a SkillPattern relative to a selected target cell into a list of
 * real battlefield cells with their damage multipliers.
 *
 * Rules:
 * - Cells with row outside [0, 1] or col outside [0, 2] are silently ignored.
 * - `side` of every result cell equals the `side` of the target (attacks never cross sides).
 * - Used for BOTH preview highlighting and actual combat — same function, no divergence.
 */
export function resolvePattern(
  target: CellCoord,
  pattern: SkillPattern,
): ResolvedHitCell[] {
  const result: ResolvedHitCell[] = [];

  for (let ri = 0; ri < pattern.cells.length; ri++) {
    const rowArr = pattern.cells[ri];
    for (let ci = 0; ci < rowArr.length; ci++) {
      const cell = rowArr[ci];
      if (cell === null) continue;

      const dr = ri - pattern.anchorRow;
      const dc = ci - pattern.anchorCol;

      const row = (target.row + dr) as Row;
      const col = (target.col + dc) as Col;

      if (row < 0 || row > 1) continue;
      if (col < 0 || col > 2) continue;

      result.push({
        coord: { side: target.side, row, col },
        multiplier: cell.damageMultiplier,
      });
    }
  }

  return result;
}
