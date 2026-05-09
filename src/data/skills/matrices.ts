import type {
  ScalingMultiplierMatrix,
  ScalingProbabilityMatrix,
  EffectAreaMatrix,
  AreaPatternCell,
} from "../../shared/skillTypes";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const P = (m: number) => ({ multiplier: m });
const A = (): AreaPatternCell => ({ multiplier: 1 as const });

// ─── Named Multiplier Matrices ────────────────────────────────────────────────
//
// Each entry is a named, reusable multiplier matrix.
// Values are computed at runtime by linear formula: baseValue + perLevelIncrease * (level - 1).
// Multiple skills can share the same matrix name.

export const MULTIPLIER_MATRICES: Record<string, ScalingMultiplierMatrix> = {
  /** Single cell. */
  single: {
    anchorRow: 0, anchorCol: 0,
    cells: [[P(0.1)]],
    scaling: { anchorPerLevelIncrease: 0.05, otherPerLevelIncrease: 0.05 },
  },

  cross_flat: {
    anchorRow: 1, anchorCol: 1,
    cells: [
      [null,   P(0.1), null  ],
      [P(0.1), P(0.1), P(0.1)],
      [null,   P(0.1), null  ],
    ],
    scaling: { anchorPerLevelIncrease: 0.05, otherPerLevelIncrease: 0.05 },
  },

  /**
   * Cross: center + 4 orthogonal neighbours.
   *   [ ]  [X]  [ ]
   *   [X]  [X]  [X]
   *   [ ]  [X]  [ ]
   */
  cross: {
    anchorRow: 1, anchorCol: 1,
    cells: [
      [null,   P(0.1), null  ],
      [P(0.1), P(0.1), P(0.1)],
      [null,   P(0.1), null  ],
    ],
    scaling: { anchorPerLevelIncrease: 0.05, otherPerLevelIncrease: 0.05 },
  },

  /** All 3 cells in target row. */
  row_sweep: {
    anchorRow: 0, anchorCol: 1,
    cells: [[P(0.1), P(0.1), P(0.1)]],
    scaling: { anchorPerLevelIncrease: 0.05, otherPerLevelIncrease: 0.05 },
  },

  /** Target cell + same column in next row. */
  pierce: {
    anchorRow: 0, anchorCol: 0,
    cells: [[P(0.1)], [P(0.1)]],
    scaling: { anchorPerLevelIncrease: 0.05, otherPerLevelIncrease: 0.05 },
  },
};

// ─── Named Effect Area Matrices ───────────────────────────────────────────────
//
// Shape-only area matrices for apply_stat_effect.
// Cell presence (A()) means "this cell is in the area". Multiplier is always 1 and is not used for magnitude.
// Effect magnitude comes from STAT_EFFECTS[effectName].bonusByLevel.
// Level keys are authored explicitly. Runtime resolves exact levels only.

export const EFFECT_AREA_MATRICES: Record<string, EffectAreaMatrix> = {
  /** Single target. */
  single: {
    levels: {
      1: { anchorRow: 0, anchorCol: 0, cells: [[A()]] },
    },
  },

  /**
   * Cross: center + 4 orthogonal neighbours.
   *   [ ]  [X]  [ ]
   *   [X]  [X]  [X]
   *   [ ]  [X]  [ ]
   */
  cross: {
    levels: {
      1: {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, A(), null],
          [A(), A(), A()],
          [null, A(), null],
        ],
      },
    },
  },
};

// ─── Named Probability Matrices ──────────────────────────────────────────────
//
// Cell multiplier values represent success PROBABILITY (0–1), not a damage
// scaling factor. These matrices drive provoke/distract probability rolls.
// Dodge / block / defense do NOT apply to this roll.
// Values are computed at runtime by linear formula and clamped to [0..1].

export const PROBABILITY_MATRICES: Record<string, ScalingProbabilityMatrix> = {
  /** Single target. */
  single: {
    anchorRow: 0, anchorCol: 0,
    cells: [[P(0.1)]],
    scaling: { anchorPerLevelIncrease: 0.05, otherPerLevelIncrease: 0.05 },
  },

  /** 3 cells in one row. */
  row_sweep: {
    anchorRow: 0, anchorCol: 1,
    cells: [[P(0.1), P(0.1), P(0.1)]],
    scaling: { anchorPerLevelIncrease: 0.05, otherPerLevelIncrease: 0.05 },
  },

  /** 2 cells in one row. */
  shot_sweep: {
    anchorRow: 0, anchorCol: 0,
    cells: [[P(0.1), P(0.1)]],
    scaling: { anchorPerLevelIncrease: 0.05, otherPerLevelIncrease: 0.05 },
  },

  /** 3×3 area. */
  all: {
    anchorRow: 1, anchorCol: 1,
    cells: [
      [P(0.1), P(0.1), P(0.1)],
      [P(0.1), P(0.1), P(0.1)],
      [P(0.1), P(0.1), P(0.1)],
    ],
    scaling: { anchorPerLevelIncrease: 0.05, otherPerLevelIncrease: 0.05 },
  },

  /**
   * Cross: center + 4 orthogonal neighbours.
   *   [ ]  [X]  [ ]
   *   [X]  [X]  [X]
   *   [ ]  [X]  [ ]
   */
  cross: {
    anchorRow: 1, anchorCol: 1,
    cells: [
      [null,   P(0.1), null  ],
      [P(0.1), P(0.1), P(0.1)],
      [null,   P(0.1), null  ],
    ],
    scaling: { anchorPerLevelIncrease: 0.05, otherPerLevelIncrease: 0.05 },
  },

  /** Main target + one additional target. */
  pierce: {
    anchorRow: 0, anchorCol: 0,
    cells: [[P(0.1), P(0.1)]],
    scaling: { anchorPerLevelIncrease: 0.05, otherPerLevelIncrease: 0.05 },
  },
};
