import { describe, it, expect } from 'vitest';
import {
  resolveScalingMultiplierPattern,
  resolveScalingProbabilityPattern,
} from '../../src/battle/skillMatrixResolver';
import type { ScalingSkillMatrix } from '../../src/shared/skillTypes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const singleCell: ScalingSkillMatrix = {
  anchorRow: 0, anchorCol: 0,
  cells: [[{ multiplier: 0.1 }]],
  scaling: { anchorPerLevelIncrease: 0.1, otherPerLevelIncrease: 0.05 },
};

// anchor at (1,1) with 0 anchor growth, other cells grow by 0.1/level
const crossMatrix: ScalingSkillMatrix = {
  anchorRow: 1, anchorCol: 1,
  cells: [
    [null,                { multiplier: 0.2 }, null               ],
    [{ multiplier: 0.2 }, { multiplier: 1.0 }, { multiplier: 0.2 }],
    [null,                { multiplier: 0.2 }, null               ],
  ],
  scaling: { anchorPerLevelIncrease: 0.0, otherPerLevelIncrease: 0.1 },
};

// ─── resolveScalingMultiplierPattern ─────────────────────────────────────────

describe('resolveScalingMultiplierPattern', () => {
  it('returns base value unchanged at level 1', () => {
    const result = resolveScalingMultiplierPattern(singleCell, 1);
    expect(result.cells[0][0]?.multiplier).toBe(0.1);
  });

  it('applies formula: baseValue + anchorPerLevelIncrease * (level - 1) to anchor cell', () => {
    const result = resolveScalingMultiplierPattern(singleCell, 3);
    // 0.1 + 0.1 * 2 = 0.3
    expect(result.cells[0][0]?.multiplier).toBeCloseTo(0.3);
  });

  it('applies anchorPerLevelIncrease to anchor and otherPerLevelIncrease to other cells', () => {
    const result = resolveScalingMultiplierPattern(crossMatrix, 3);
    // anchor (1,1): 1.0 + 0.0 * 2 = 1.0
    expect(result.cells[1][1]?.multiplier).toBeCloseTo(1.0);
    // other (0,1): 0.2 + 0.1 * 2 = 0.4
    expect(result.cells[0][1]?.multiplier).toBeCloseTo(0.4);
  });

  it('keeps null cells null at any level', () => {
    const result = resolveScalingMultiplierPattern(crossMatrix, 5);
    expect(result.cells[0][0]).toBeNull();
    expect(result.cells[0][2]).toBeNull();
    expect(result.cells[2][0]).toBeNull();
    expect(result.cells[2][2]).toBeNull();
  });

  it('preserves anchorRow and anchorCol on the returned pattern', () => {
    const result = resolveScalingMultiplierPattern(crossMatrix, 1);
    expect(result.anchorRow).toBe(1);
    expect(result.anchorCol).toBe(1);
  });

  it('does not clamp values above 1', () => {
    // 0.1 + 0.1 * 19 = 2.0
    const result = resolveScalingMultiplierPattern(singleCell, 20);
    expect(result.cells[0][0]?.multiplier).toBeGreaterThan(1);
  });

  it('throws for level 0', () => {
    expect(() => resolveScalingMultiplierPattern(singleCell, 0)).toThrow();
  });

  it('throws for negative level', () => {
    expect(() => resolveScalingMultiplierPattern(singleCell, -1)).toThrow();
  });

  it('throws for NaN level', () => {
    expect(() => resolveScalingMultiplierPattern(singleCell, Number.NaN)).toThrow();
  });

  it('throws for fractional level', () => {
    expect(() => resolveScalingMultiplierPattern(singleCell, 1.5)).toThrow();
  });

  it('throws when anchor cell is null', () => {
    const badAnchor: ScalingSkillMatrix = {
      anchorRow: 0, anchorCol: 0,
      cells: [[null]],
      scaling: { anchorPerLevelIncrease: 0.1, otherPerLevelIncrease: 0.05 },
    };
    expect(() => resolveScalingMultiplierPattern(badAnchor, 1)).toThrow();
  });

  it('throws when anchor is out of bounds', () => {
    const badAnchor: ScalingSkillMatrix = {
      anchorRow: 5, anchorCol: 5,
      cells: [[{ multiplier: 0.1 }]],
      scaling: { anchorPerLevelIncrease: 0.1, otherPerLevelIncrease: 0.05 },
    };
    expect(() => resolveScalingMultiplierPattern(badAnchor, 1)).toThrow();
  });
});

// ─── resolveScalingProbabilityPattern ────────────────────────────────────────

describe('resolveScalingProbabilityPattern', () => {
  it('clamps value above 1 to 1', () => {
    const matrix: ScalingSkillMatrix = {
      anchorRow: 0, anchorCol: 0,
      cells: [[{ multiplier: 0.8 }]],
      scaling: { anchorPerLevelIncrease: 0.5, otherPerLevelIncrease: 0.5 },
    };
    // level 2: 0.8 + 0.5 = 1.3 → clamped to 1
    const result = resolveScalingProbabilityPattern(matrix, 2);
    expect(result.cells[0][0]?.multiplier).toBe(1);
  });

  it('clamps value below 0 to 0', () => {
    const matrix: ScalingSkillMatrix = {
      anchorRow: 0, anchorCol: 0,
      cells: [[{ multiplier: 0.1 }]],
      scaling: { anchorPerLevelIncrease: -0.2, otherPerLevelIncrease: -0.2 },
    };
    // level 2: 0.1 + (-0.2) = -0.1 → clamped to 0
    const result = resolveScalingProbabilityPattern(matrix, 2);
    expect(result.cells[0][0]?.multiplier).toBe(0);
  });

  it('keeps null cells null', () => {
    const result = resolveScalingProbabilityPattern(crossMatrix, 3);
    expect(result.cells[0][0]).toBeNull();
  });

  it('throws for level < 1', () => {
    expect(() => resolveScalingProbabilityPattern(singleCell, 0)).toThrow();
  });
});
