import type {
  LeveledMultiplierMatrix,
  EffectAreaMatrix,
  AreaPatternCell,
} from "../../shared/skillTypes";

// ─── Helper ───────────────────────────────────────────────────────────────────

const P = (m: number) => ({ multiplier: m });
const A = (): AreaPatternCell => ({ multiplier: 1 as const });

// ─── Named Multiplier Matrices ────────────────────────────────────────────────────
//
// Each entry is a named, reusable multiplier matrix.
// Level keys are authored explicitly. Runtime resolves exact levels only.
// Multiple skills can share the same matrix name.

export const MULTIPLIER_MATRICES: Record<string, LeveledMultiplierMatrix> = {
  /** Single cell, 100% damage. */
  single: {
    levels: {
      1: { anchorRow: 0, anchorCol: 0, cells: [[P(0.1)]] },
      10: { anchorRow: 0, anchorCol: 0, cells: [[P(1.0)]] },
      12: { anchorRow: 0, anchorCol: 0, cells: [[P(1.25)]] },
    },
  },
  cross_flat: {
    levels: {
      1: {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.1), null],
          [P(0.1), P(0.1), P(0.1)],
          [null, P(0.1), null],
        ],
      },
      2: {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.2), null],
          [P(0.2), P(0.2), P(0.2)],
          [null, P(0.2), null],
        ],
      },
    },
  },

  /**
   * Cross: center 100%, 4 orthogonal neighbours 20%.
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
          [null, P(0.2), null],
          [P(0.2), P(1.0), P(0.2)],
          [null, P(0.2), null],
        ],
      },
      2: {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.4), null],
          [P(0.4), P(1.0), P(0.4)],
          [null, P(0.4), null],
        ],
      },
    },
  },

  /** All 3 cells in target row at 100%. */
  row_sweep: {
    levels: {
      1: { anchorRow: 0, anchorCol: 1, cells: [[P(1.0), P(1.0), P(1.0)]] },
      2: { anchorRow: 0, anchorCol: 1, cells: [[P(1.3), P(1.3), P(1.3)]] },
    },
  },

  /** Target cell 100%, same column next row 50%. */
  pierce: {
    levels: {
      1: { anchorRow: 0, anchorCol: 0, cells: [[P(1.0)], [P(0.5)]] },
      2: { anchorRow: 0, anchorCol: 0, cells: [[P(1.0)], [P(0.75)]] },
    },
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
// Level keys are authored explicitly. Runtime resolves exact levels only.

export const PROBABILITY_MATRICES: Record<string, LeveledMultiplierMatrix> = {
  /** Single target. */
  single: {
    levels: {
      1: { anchorRow: 0, anchorCol: 0, cells: [[P(0.6)]] },
      2: { anchorRow: 0, anchorCol: 0, cells: [[P(1)]] },
      3: { anchorRow: 0, anchorCol: 0, cells: [[P(1)]] },
      4: { anchorRow: 0, anchorCol: 0, cells: [[P(1)]] },
    },
  },

  /** 3 cells in one row. */
  row_sweep: {
    levels: {
      1: {
        anchorRow: 0,
        anchorCol: 1,
        cells: [[P(0.6), P(0.6), P(0.6)]],
      },
    },
  },

  /** 2 cells in one row. */
  shot_sweep: {
    levels: {
      1: {
        anchorRow: 0,
        anchorCol: 0,
        cells: [[P(0.5), P(0.5)]],
      },
      2: {
        anchorRow: 0,
        anchorCol: 0,
        cells: [[P(0.8), P(0.8)]],
      },
    },
  },

  /** 3x3 area. */
  all: {
    levels: {
      1: {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [P(0.3), P(0.3), P(0.3)],
          [P(0.3), P(0.3), P(0.3)],
          [P(0.3), P(0.3), P(0.3)],
        ],
      },
      2: {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [P(0.4), P(0.4), P(0.4)],
          [P(0.4), P(0.4), P(0.4)],
          [P(0.4), P(0.4), P(0.4)],
        ],
      },
      3: {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [P(0.5), P(0.5), P(0.5)],
          [P(0.5), P(0.5), P(0.5)],
          [P(0.5), P(0.5), P(0.5)],
        ],
      },
      4: {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [P(1), P(1), P(1)],
          [P(1), P(1), P(1)],
          [P(1), P(1), P(1)],
        ],
      },
    },
  },

  /**
   * Cross: center + 4 orthogonal neighbours.
   */
  cross: {
    levels: {
      1: {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.5), null],
          [P(0.5), P(0.1), P(0.5)],
          [null, P(0.5), null],
        ],
      },
      2: {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.4), null],
          [P(0.4), P(0.7), P(0.4)],
          [null, P(0.4), null],
        ],
      },
      3: {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.3), null],
          [P(0.3), P(1), P(0.3)],
          [null, P(0.3), null],
        ],
      },
    },
  },

  /** Main target + one additional target. */
  pierce: {
    levels: {
      1: {
        anchorRow: 0,
        anchorCol: 0,
        cells: [[P(0.75), P(1)]],
      },
    },
  },
};
