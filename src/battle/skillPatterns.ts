import {
  CellCoord,
  Col,
  ResolvedHitCell,
  Row,
  SkillPattern,
} from "./types";

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
        multiplier: cell.multiplier,
      });
    }
  }

  return result;
}
