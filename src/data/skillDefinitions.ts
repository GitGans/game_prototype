import type { ActionSkillDefinition } from "../shared/skillDefinitionTypes";
import type {
  DamageModifierType,
  Effect,
  LeveledMultiplierMatrix,
  LeveledEffectDef,
  SkillLevelTable,
} from "../shared/skillTypes";

// ─── Helper ───────────────────────────────────────────────────────────────────

const P = (m: number) => ({ multiplier: m });

// ─── Base Effects ─────────────────────────────────────────────────────────────

const EFFECTS: Record<string, Effect> = {
  regeneration: {
    id: "regeneration",
    effectTone: "positive",
    description: "Restores HP each round",
  },
  lose_health: {
    id: "lose_health",
    effectTone: "negative",
    description: "Deals damage each round",
  },
  fortify: {
    id: "fortify",
    effectTone: "positive",
    physicalDefenseBonus: 1,
    description: "Increases physical defense",
  },
  weaken: {
    id: "weaken",
    effectTone: "negative",
    physicalDefenseBonus: -1,
    description: "Reduces physical defense",
  },
  arcane_shield: {
    id: "arcane_shield",
    effectTone: "positive",
    magicalDefenseBonus: 1,
    description: "Increases magical defense",
  },
  arcane_vulnerability: {
    id: "arcane_vulnerability",
    effectTone: "negative",
    magicalDefenseBonus: -1,
    description: "Reduces magical defense",
  },
  swift: {
    id: "swift",
    effectTone: "positive",
    dodgeBonus: 1,
    description: "Increases dodge chance",
  },
  clumsy: {
    id: "clumsy",
    effectTone: "negative",
    dodgeBonus: -1,
    description: "Reduces dodge chance",
  },
  guard_stance: {
    id: "guard_stance",
    effectTone: "positive",
    blockBonus: 1,
    description: "Increases block chance",
  },
  off_balance: {
    id: "off_balance",
    effectTone: "negative",
    blockBonus: -1,
    description: "Reduces block chance",
  },
  haste: {
    id: "haste",
    effectTone: "positive",
    initiativeBonus: 1,
    description: "Increases initiative",
  },
  slow: {
    id: "slow",
    effectTone: "negative",
    initiativeBonus: -1,
    description: "Reduces initiative",
  },
  empower: {
    id: "empower",
    effectTone: "positive",
    physicalStrengthBonus: 1,
    description: "Increases physical attack",
  },
  enfeeble: {
    id: "enfeeble",
    effectTone: "negative",
    physicalStrengthBonus: -1,
    description: "Reduces physical attack",
  },
  arcane_surge: {
    id: "arcane_surge",
    effectTone: "positive",
    magicalStrengthBonus: 1,
    description: "Increases magical attack",
  },
  arcane_drain: {
    id: "arcane_drain",
    effectTone: "negative",
    magicalStrengthBonus: -1,
    description: "Reduces magical attack",
  },
};

// ─── Named Damage Matrices ────────────────────────────────────────────────────
//
// Each entry is a named, reusable damage matrix.
// Level keys are authored explicitly. Runtime resolves exact levels only.
// Multiple skills can share the same matrix name.

export const MULTIPLIER_MATRICES: Record<string, LeveledMultiplierMatrix> = {
  /** Single cell, 100% damage. */
  single: {
    levels: {
      1: { anchorRow: 0, anchorCol: 0, cells: [[P(1.0)]] },
      2: { anchorRow: 0, anchorCol: 0, cells: [[P(1.25)]] },
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

// ─── Named Effect Matrices ────────────────────────────────────────────────────
//
// Defines WHERE an effect lands (which cells) and with what multiplier.
// Level keys are authored explicitly. Runtime resolves exact levels only.
//
// For periodic HP effects (regeneration / lose_health):
//   amountPerTurn = caster power (selected by powerSource) × hit cell multiplier
//   If one unit is hit by multiple cells, the highest resulting amount is used.
// For stat modifier effects (fortify / weaken / etc.):
//   only cell presence matters; multiplier is currently unused for stat modifier magnitude.

export const EFFECT_MATRICES: Record<string, LeveledMultiplierMatrix> = {
  /** Single target. Multiplier used for stat-based per-turn scaling. */
  single: {
    levels: {
      1: { anchorRow: 0, anchorCol: 0, cells: [[P(0.25)]] },
      2: { anchorRow: 0, anchorCol: 0, cells: [[P(0.4)]] },
      3: { anchorRow: 0, anchorCol: 0, cells: [[P(0.6)]] },
    },
  },

  /**
   * Cross: center + 4 orthogonal neighbours.
   * For stat modifier effects: all cells share the same multiplier (unused for magnitude).
   * For periodic HP effects: each cell multiplier drives its cell's per-turn value.
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
          [P(0.2), P(0.4), P(0.2)],
          [null, P(0.2), null],
        ],
      },
      2: {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.3), null],
          [P(0.3), P(0.3), P(0.3)],
          [null, P(0.3), null],
        ],
      },
    },
  },
};

// ─── Leveled Effect Definitions ───────────────────────────────────────────────
//
// effectKind classifies which action type may use this effect.
// It does not choose periodic HP direction or scaling.
// Periodic HP direction and scaling are authored on apply_periodic_hp_effect.
//
// bonusByLevel — fixed-magnitude stat modifiers keyed by level (1-based).
//   Level keys are authored explicitly. Runtime resolves exact levels only.
//   No stat scaling. Sign is inherited from the base Effect in EFFECTS.

export const LEVELED_EFFECTS: Record<string, LeveledEffectDef> = {
  regeneration: {
    effectKind: "periodic_hp",
    effect: EFFECTS.regeneration,
  },

  lose_health: {
    effectKind: "periodic_hp",
    effect: EFFECTS.lose_health,
  },

  fortify: {
    effectKind: "stat_modifier",
    effect: EFFECTS.fortify,
    bonusByLevel: { 1: 10, 2: 20, 3: 30 }, // physicalDefenseBonus sign (+) inherited from EFFECTS.fortify
  },

  weaken: {
    effectKind: "stat_modifier",
    effect: EFFECTS.weaken,
    bonusByLevel: { 1: 10, 2: 20, 3: 30 }, // physicalDefenseBonus sign (-) inherited from EFFECTS.weaken
  },

  arcane_shield: {
    effectKind: "stat_modifier",
    effect: EFFECTS.arcane_shield,
    bonusByLevel: { 1: 10, 2: 20, 3: 30 }, // magicalDefenseBonus sign (+) inherited from EFFECTS.arcane_shield
  },

  arcane_vulnerability: {
    effectKind: "stat_modifier",
    effect: EFFECTS.arcane_vulnerability,
    bonusByLevel: { 1: 10, 2: 20, 3: 30 }, // magicalDefenseBonus sign (-) inherited from EFFECTS.arcane_vulnerability
  },

  swift: {
    effectKind: "stat_modifier",
    effect: EFFECTS.swift,
    bonusByLevel: { 1: 10, 2: 20, 3: 30 }, // dodgeBonus sign (+) inherited from EFFECTS.swift
  },

  clumsy: {
    effectKind: "stat_modifier",
    effect: EFFECTS.clumsy,
    bonusByLevel: { 1: 10, 2: 20, 3: 30 }, // dodgeBonus sign (-) inherited from EFFECTS.clumsy
  },

  guard_stance: {
    effectKind: "stat_modifier",
    effect: EFFECTS.guard_stance,
    bonusByLevel: { 1: 10, 2: 20, 3: 30 }, // blockBonus sign (+) inherited from EFFECTS.guard_stance
  },

  off_balance: {
    effectKind: "stat_modifier",
    effect: EFFECTS.off_balance,
    bonusByLevel: { 1: 10, 2: 20, 3: 30 }, // blockBonus sign (-) inherited from EFFECTS.off_balance
  },

  haste: {
    effectKind: "stat_modifier",
    effect: EFFECTS.haste,
    bonusByLevel: { 1: 1, 2: 2, 3: 3 }, // initiativeBonus sign (+) inherited from EFFECTS.haste
  },

  slow: {
    effectKind: "stat_modifier",
    effect: EFFECTS.slow,
    bonusByLevel: { 1: 1, 2: 2, 3: 3 }, // initiativeBonus sign (-) inherited from EFFECTS.slow
  },

  empower: {
    effectKind: "stat_modifier",
    effect: EFFECTS.empower,
    bonusByLevel: { 1: 10, 2: 20, 3: 30 }, // physicalStrengthBonus sign (+) inherited from EFFECTS.empower
  },

  enfeeble: {
    effectKind: "stat_modifier",
    effect: EFFECTS.enfeeble,
    bonusByLevel: { 1: 10, 2: 20, 3: 30 }, // physicalStrengthBonus sign (-) inherited from EFFECTS.enfeeble
  },

  arcane_surge: {
    effectKind: "stat_modifier",
    effect: EFFECTS.arcane_surge,
    bonusByLevel: { 1: 10, 2: 20, 3: 30 }, // magicalStrengthBonus sign (+) inherited from EFFECTS.arcane_surge
  },

  arcane_drain: {
    effectKind: "stat_modifier",
    effect: EFFECTS.arcane_drain,
    bonusByLevel: { 1: 10, 2: 20, 3: 30 }, // magicalStrengthBonus sign (-) inherited from EFFECTS.arcane_drain
  },
};

// ─── Named Instant Effect Matrices ───────────────────────────────────────────
//
// Cell values are stored in multiplier but represent success PROBABILITY (0–1),
// not a damage scaling factor. Instant effects are not damage; they are provoke/distract.
// Dodge / block / defense do NOT apply to this roll.
// Level keys are authored explicitly. Runtime resolves exact levels only.

export const INSTANT_EFFECT_MATRICES: Record<string, LeveledMultiplierMatrix> = {
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

export const DAMAGE_MODIFIER_LEVELS: Record<DamageModifierType, SkillLevelTable<number>> = {
  ignore_block:            { 1: 25, 2: 50, 3: 75, 4: 100 },
  ignore_dodge:            { 1: 25, 2: 50, 3: 75, 4: 100 },
  ignore_physical_defense: { 1: 25, 2: 50, 3: 75, 4: 100 },
  ignore_magical_defense:  { 1: 25, 2: 50, 3: 75, 4: 100 },
};

// ─── Vampirism Levels ─────────────────────────────────────────────────────────
// Values are % of total real damage converted to HP.
// Level keys are authored explicitly. Runtime resolves exact levels only.

export const VAMPIRISM_LEVELS: SkillLevelTable<number> = { 1: 25, 2: 50, 3: 100 };

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
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
      },
      {
        type: "apply_stat_effect",
        effectName: "slow",
        displayName: "Slow",
        level: 1,
        duration: 2,
        matrix: { kind: "effect_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
      },
      {
        type: "apply_stat_effect",
        effectName: "fortify",
        displayName: "Defence",
        level: 1,
        duration: 2,
        matrix: { kind: "effect_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
      },
      {
        type: "apply_periodic_hp_effect",
        effectName: "regeneration",
        displayName: "Regeneration",
        direction: "heal",
        powerSource: "physical_strength",
        level: 1,
        duration: 2,
        matrix: { kind: "effect_matrix", matrixName: "cross", level: 1 },
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
        matrix: { kind: "effect_matrix", matrixName: "cross", level: 1 },
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
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
      },
      {
        type: "apply_periodic_hp_effect",
        effectName: "lose_health",
        displayName: "Poisoned",
        direction: "damage",
        powerSource: "physical_strength",
        level: 1,
        duration: 3,
        matrix: { kind: "effect_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
      },
      {
        type: "apply_stat_effect",
        effectName: "weaken",
        displayName: "Weakened",
        level: 1,
        duration: 2,
        matrix: { kind: "effect_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
      },
      {
        type: "instant_effect",
        instantEffectType: "provoke",
        displayName: "Provoke",
        matrix: {
          kind: "instant_effect_matrix",
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
        matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
      },
      {
        type: "instant_effect",
        instantEffectType: "distract",
        displayName: "Distract",
        matrix: {
          kind: "instant_effect_matrix",
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
