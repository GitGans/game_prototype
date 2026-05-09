import type {
  ScalingMultiplierMatrix,
  ScalingProbabilityMatrix,
  SkillPattern,
} from '../shared/skillTypes';

// Shared computation — not exported. Called by both public resolver functions.
function computeScaledPattern(matrix: ScalingMultiplierMatrix, level: number): SkillPattern {
  if (!Number.isInteger(level) || level < 1)
    throw new Error(`Invalid skill level: ${level}. Level must be a positive integer.`);

  const anchorCell = matrix.cells[matrix.anchorRow]?.[matrix.anchorCol];
  if (!anchorCell)
    throw new Error(
      `Invalid matrix: anchor cell at [${matrix.anchorRow}][${matrix.anchorCol}] is null or out of bounds.`
    );

  return {
    anchorRow: matrix.anchorRow,
    anchorCol: matrix.anchorCol,
    cells: matrix.cells.map((row, ri) =>
      row.map((cell, ci) => {
        if (!cell) return null;
        const isAnchor = ri === matrix.anchorRow && ci === matrix.anchorCol;
        const increase = isAnchor
          ? matrix.scaling.anchorPerLevelIncrease
          : matrix.scaling.otherPerLevelIncrease;
        return { multiplier: cell.multiplier + increase * (level - 1) };
      })
    ),
  };
}

// For damage / heal / apply_periodic_hp_effect actions.
// No clamping — multiplier values are not bounded.
export function resolveScalingMultiplierPattern(
  matrix: ScalingMultiplierMatrix,
  level: number,
): SkillPattern {
  return computeScaledPattern(matrix, level);
}

// For probability_effect actions.
// Clamps all cell values to [0..1] — this is the contract of probability matrices.
export function resolveScalingProbabilityPattern(
  matrix: ScalingProbabilityMatrix,
  level: number,
): SkillPattern {
  const pattern = computeScaledPattern(matrix, level);
  return {
    ...pattern,
    cells: pattern.cells.map(row =>
      row.map(cell =>
        cell ? { multiplier: Math.min(1, Math.max(0, cell.multiplier)) } : null
      )
    ),
  };
}
