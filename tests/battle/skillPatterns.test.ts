import { describe, it, expect } from "vitest";
import { resolvePattern } from "../../src/battle/skillPatterns";
import type { SkillPattern } from "../../src/battle/types";
import { coord } from "./helpers/coords";

describe("resolvePattern", () => {
  it("clips cells that would fall outside the 2×3 side field", () => {
    // 3×3 pattern anchored at center [1][1].
    // When target is at row=0, col=0, the top row (dr=-1) and left column (dc=-1)
    // go out of bounds and must be clipped.
    const pattern: SkillPattern = {
      anchorRow: 1,
      anchorCol: 1,
      cells: [
        [{ damageMultiplier: 1 }, { damageMultiplier: 1 }, { damageMultiplier: 1 }],
        [{ damageMultiplier: 1 }, { damageMultiplier: 1 }, { damageMultiplier: 1 }],
        [{ damageMultiplier: 1 }, { damageMultiplier: 1 }, { damageMultiplier: 1 }],
      ],
    };
    const target = coord("player", 0, 0);
    const result = resolvePattern(target, pattern);

    for (const { coord: c } of result) {
      expect(c.side).toBe("player");
      expect([0, 1]).toContain(c.row);
      expect([0, 1, 2]).toContain(c.col);
    }

    // With target at (0,0), only the bottom-right 2×2 quadrant of the 3×3 pattern
    // is in bounds: 4 cells maximum.
    expect(result.length).toBeLessThanOrEqual(4);
    expect(result.length).toBeGreaterThan(0);
  });
});
