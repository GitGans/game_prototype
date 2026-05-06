import type { ActionSkillDefinition } from "../shared/skillDefinitionTypes";
import type {
  DamageModifierType,
  LeveledMultiplierMatrix,
  SkillLevelTable,
  EffectAreaMatrix,
  AreaPatternCell,
  StatEffectDef,
  PeriodicHpEffectDef,
} from "../shared/skillTypes";

// ─── Helper ───────────────────────────────────────────────────────────────────

const P = (m: number) => ({ multiplier: m });
const A = (): AreaPatternCell => ({ multiplier: 1 as const });


// ─── Named Damage Matrices ────────────────────────────────────────────────────
//
// Each entry is a named, reusable damage matrix.
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
          [A(),  A(), A() ],
          [null, A(), null],
        ],
      },
    },
  },
};

// ─── Periodic HP Effect Definitions ──────────────────────────────────────────
//
// direction: "buff" | "debuff" — used only for display classification (effectTone).
// Runtime tick direction (heal/damage) and power come from the action's `direction`
// and `powerSource` fields, not from here.

export const PERIODIC_HP_EFFECTS: Record<string, PeriodicHpEffectDef> = {
  regeneration: {
    direction: "buff",
    description: "Restores HP each round",
  },

  lose_health: {
    direction: "debuff",
    description: "Deals damage each round",
  },
};

// ─── Stat Effect Definitions ──────────────────────────────────────────────────
//
// direction: "buff"   → effectTone "positive", bonus applied as +bonusByLevel[level]
// direction: "debuff" → effectTone "negative", bonus applied as -bonusByLevel[level]
// bonusByLevel — unsigned magnitude. Sign is derived from direction at resolution time.
// Level keys are authored explicitly. Runtime resolves exact levels only.

export const STAT_EFFECTS: Record<string, StatEffectDef> = {
  fortify: {
    direction: "buff",
    bonusField: "physicalDefenseBonus",
    description: "Increases physical defense",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  weaken: {
    direction: "debuff",
    bonusField: "physicalDefenseBonus",
    description: "Reduces physical defense",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  arcane_shield: {
    direction: "buff",
    bonusField: "magicalDefenseBonus",
    description: "Increases magical defense",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  arcane_vulnerability: {
    direction: "debuff",
    bonusField: "magicalDefenseBonus",
    description: "Reduces magical defense",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  swift: {
    direction: "buff",
    bonusField: "dodgeBonus",
    description: "Increases dodge chance",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  clumsy: {
    direction: "debuff",
    bonusField: "dodgeBonus",
    description: "Reduces dodge chance",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  guard_stance: {
    direction: "buff",
    bonusField: "blockBonus",
    description: "Increases block chance",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  off_balance: {
    direction: "debuff",
    bonusField: "blockBonus",
    description: "Reduces block chance",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  haste: {
    direction: "buff",
    bonusField: "initiativeBonus",
    description: "Increases initiative",
    bonusByLevel: { 1: 1, 2: 2, 3: 3 },
  },

  slow: {
    direction: "debuff",
    bonusField: "initiativeBonus",
    description: "Reduces initiative",
    bonusByLevel: { 1: 1, 2: 2, 3: 3 },
  },

  empower: {
    direction: "buff",
    bonusField: "physicalStrengthBonus",
    description: "Increases physical attack",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  enfeeble: {
    direction: "debuff",
    bonusField: "physicalStrengthBonus",
    description: "Reduces physical attack",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  arcane_surge: {
    direction: "buff",
    bonusField: "magicalStrengthBonus",
    description: "Increases magical attack",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },

  arcane_drain: {
    direction: "debuff",
    bonusField: "magicalStrengthBonus",
    description: "Reduces magical attack",
    bonusByLevel: { 1: 10, 2: 20, 3: 30 },
  },
};

// ─── Named Probability Matrices ──────────────────────────────────────────────
//
// Cell multiplier values represent success PROBABILITY (0–1), not a damage
// scaling factor. These matrices drive provoke/distract probability rolls.
// Dodge / block / defense do NOT apply to this roll.
// Level keys are authored explicitly. Runtime resolves exact levels only.

export const PROBABILITY_MATRICES: Record<string, LeveledMultiplierMatrix> =
  {
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

// ─── Damage Modifier Levels ───────────────────────────────────────────────────
// Values are percentages (0–100) of the stat that is IGNORED.
// Level keys are authored explicitly. Runtime resolves exact levels only.

export const DAMAGE_MODIFIER_LEVELS: Record<
  DamageModifierType,
  SkillLevelTable<number>
> = {
  ignore_block: { 1: 25, 2: 50, 3: 75, 4: 100 },
  ignore_dodge: { 1: 25, 2: 50, 3: 75, 4: 100 },
  ignore_physical_defense: { 1: 25, 2: 50, 3: 75, 4: 100 },
  ignore_magical_defense: { 1: 25, 2: 50, 3: 75, 4: 100 },
};

// ─── Vampirism Levels ─────────────────────────────────────────────────────────
// Values are % of total real damage converted to HP.
// Level keys are authored explicitly. Runtime resolves exact levels only.

export const VAMPIRISM_LEVELS: SkillLevelTable<number> = {
  1: 25,
  2: 50,
  3: 100,
};

// ─── Skill Definitions ────────────────────────────────────────────────────────

export const SKILLS: Record<string, ActionSkillDefinition> = {
  p_melee_basic: {
    definitionKind: "action_skill",
    id: "p_melee_basic",
    name: "Strike",
    targetPolicy: { type: "enemy_melee" },
    actions: [
      {
        type: "damage",
        powerSource: "physical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 10 },
      },
    ],
  },

  p_ranged_basic: {
    definitionKind: "action_skill",
    id: "p_ranged_basic",
    name: "Shot",
    targetPolicy: { type: "enemy_ranged" },
    actions: [
      {
        type: "damage",
        powerSource: "physical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 10 },
      },
    ],
  },

  m_ranged_basic: {
    definitionKind: "action_skill",
    id: "m_ranged_basic",
    name: "Magic Shot",
    targetPolicy: { type: "enemy_ranged" },
    actions: [
      {
        type: "damage",
        powerSource: "magical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 10 },
      },
    ],
  },

  p_ranged_slowing: {
    definitionKind: "action_skill",
    id: "p_ranged_slowing",
    name: "Arrow that breaks legs",
    targetPolicy: { type: "enemy_ranged" },
    actions: [
      {
        type: "damage",
        powerSource: "physical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 10 },
      },
      {
        type: "apply_stat_effect",
        effectName: "slow",
        displayName: "Slow",
        level: 1,
        duration: 2,
        matrix: { kind: "effect_area_matrix", matrixName: "single", level: 1 },
      },
    ],
  },

  m_heal_basic: {
    definitionKind: "action_skill",
    id: "m_heal_basic",
    name: "Heal",
    targetPolicy: { type: "friendly" },
    actions: [
      {
        type: "heal",
        powerSource: "magical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 10 },
      },
    ],
  },

  heal_with_defence: {
    definitionKind: "action_skill",
    id: "heal_with_defence",
    name: "Protective Heal",
    targetPolicy: { type: "friendly" },
    actions: [
      {
        type: "heal",
        powerSource: "physical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 10 },
      },
      {
        type: "apply_stat_effect",
        effectName: "fortify",
        displayName: "Defence",
        level: 1,
        duration: 2,
        matrix: { kind: "effect_area_matrix", matrixName: "single", level: 1 },
      },
    ],
  },

  self_heal_mass_regeneration: {
    definitionKind: "action_skill",
    id: "self_heal_mass_regeneration",
    name: "Regenerative Heal",
    targetPolicy: { type: "self" },
    actions: [
      {
        type: "heal",
        powerSource: "physical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 10 },
      },
      {
        type: "apply_periodic_hp_effect",
        effectName: "regeneration",
        displayName: "Regeneration",
        direction: "heal",
        powerSource: "physical_strength",
        level: 1,
        duration: 2,
        matrix: { kind: "multiplier_matrix", matrixName: "cross_flat", level: 1 },
      },
    ],
  },

  arcane_cross: {
    definitionKind: "action_skill",
    id: "arcane_cross",
    name: "Arcane Cross",
    targetPolicy: { type: "enemy_ranged" },
    actions: [
      {
        type: "damage",
        powerSource: "magical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "cross", level: 1 },
      },
      {
        type: "apply_periodic_hp_effect",
        effectName: "lose_health",
        displayName: "Arcane Burn",
        direction: "damage",
        powerSource: "magical_strength",
        level: 1,
        duration: 2,
        matrix: { kind: "multiplier_matrix", matrixName: "cross_flat", level: 1 },
      },
    ],
  },

  row_strike: {
    definitionKind: "action_skill",
    id: "row_strike",
    name: "Row Strike",
    targetPolicy: { type: "enemy_melee" },
    actions: [
      {
        type: "damage",
        powerSource: "physical_strength",
        matrix: {
          kind: "multiplier_matrix",
          matrixName: "row_sweep",
          level: 1,
        },
      },
    ],
  },

  pierce: {
    definitionKind: "action_skill",
    id: "pierce",
    name: "Pierce",
    targetPolicy: { type: "enemy_melee" },
    actions: [
      {
        type: "damage",
        powerSource: "physical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "pierce", level: 1 },
      },
    ],
  },

  poison_strike: {
    definitionKind: "action_skill",
    id: "poison_strike",
    name: "Poison Strike",
    targetPolicy: { type: "enemy_melee" },
    actions: [
      {
        type: "damage",
        powerSource: "physical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 10 },
      },
      {
        type: "apply_periodic_hp_effect",
        effectName: "lose_health",
        displayName: "Poisoned",
        direction: "damage",
        powerSource: "physical_strength",
        level: 1,
        duration: 3,
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
      },
    ],
  },

  weaken_curse: {
    definitionKind: "action_skill",
    id: "weaken_curse",
    name: "Weaken Curse",
    targetPolicy: { type: "enemy_ranged" },
    actions: [
      {
        type: "damage",
        powerSource: "physical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 10 },
      },
      {
        type: "apply_stat_effect",
        effectName: "weaken",
        displayName: "Weakened",
        level: 1,
        duration: 2,
        matrix: { kind: "effect_area_matrix", matrixName: "single", level: 1 },
      },
    ],
  },

  provoke_strike: {
    definitionKind: "action_skill",
    id: "provoke_strike",
    name: "Provoke",
    targetPolicy: { type: "enemy_melee" },
    actions: [
      {
        type: "damage",
        powerSource: "physical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 10 },
      },
      {
        type: "probability_effect",
        probabilityEffectType: "provoke",
        displayName: "Provoke",
        matrix: {
          kind: "probability_matrix",
          matrixName: "single",
          level: 1,
        },
      },
    ],
  },

  distract_shot: {
    definitionKind: "action_skill",
    id: "distract_shot",
    name: "Distract",
    targetPolicy: { type: "enemy_ranged" },
    actions: [
      {
        type: "damage",
        powerSource: "physical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 10 },
      },
      {
        type: "probability_effect",
        probabilityEffectType: "distract",
        displayName: "Distract",
        matrix: {
          kind: "probability_matrix",
          matrixName: "single",
          level: 1,
        },
      },
    ],
  },

  armor_pierce: {
    definitionKind: "action_skill",
    id: "armor_pierce",
    name: "Armor Pierce",
    targetPolicy: { type: "enemy_melee" },
    actions: [
      {
        type: "damage",
        powerSource: "physical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
        modifiers: [{ modifierType: "ignore_physical_defense", level: 3 }],
      },
    ],
  },

  drain_strike: {
    definitionKind: "action_skill",
    id: "drain_strike",
    name: "Drain Strike",
    targetPolicy: { type: "enemy_melee" },
    actions: [
      {
        type: "damage",
        powerSource: "physical_strength",
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
      },
      {
        type: "post_damage",
        postDamageType: "mass_vampirism",
        level: 3,
      },
    ],
  },

  life_sweep: {
    definitionKind: "action_skill",
    id: "life_sweep",
    name: "Life Sweep",
    targetPolicy: { type: "enemy_melee" },
    actions: [
      {
        type: "damage",
        powerSource: "physical_strength",
        matrix: {
          kind: "multiplier_matrix",
          matrixName: "row_sweep",
          level: 1,
        },
        modifiers: [{ modifierType: "ignore_block", level: 2 }],
      },
      {
        type: "post_damage",
        postDamageType: "mass_vampirism",
        level: 1,
      },
    ],
  },
};
