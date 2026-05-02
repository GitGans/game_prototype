import type { CellCoord } from "../../../src/battle/types";

export const coord = (
  side: "player" | "enemy",
  row: 0 | 1,
  col: 0 | 1 | 2,
): CellCoord => ({ side, row, col });
