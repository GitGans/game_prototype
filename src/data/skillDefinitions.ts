import type { ActionSkillDefinition } from "../shared/skillDefinitionTypes";
import type {
  DamageModifierType,
  Effect,
  LeveledDamageMatrix,
  LeveledEffectDef,
} from "../shared/skillTypes";

// ─── Helper ───────────────────────────────────────────────────────────────────

const P = (m: number) => ({ damageMultiplier: m });

// ─── Base Effects ─────────────────────────────────────────────────────────────

const EFFECTS: Record<string, Effect> = {
  regeneration: {
    id: "regeneration",
    isBuff: true,
    description: "Restores HP each round",
  },
  lose_health: {
    id: "lose_health",
    isBuff: false,
    description: "Deals damage each round",
  },
  fortify: {
    id: "fortify",
    isBuff: true,
    physicalDefenseBonus: 1,
    description: "Increases physical defense",
  },
  weaken: {
    id: "weaken",
    isBuff: false,
    physicalDefenseBonus: -1,
    description: "Reduces physical defense",
  },
  arcane_shield: {
    id: "arcane_shield",
    isBuff: true,
    magicalDefenseBonus: 1,
    description: "Increases magical defense",
  },
  arcane_vulnerability: {
    id: "arcane_vulnerability",
    isBuff: false,
    magicalDefenseBonus: -1,
    description: "Reduces magical defense",
  },
  swift: {
    id: "swift",
    isBuff: true,
    dodgeBonus: 1,
    description: "Increases dodge chance",
  },
  clumsy: {
    id: "clumsy",
    isBuff: false,
    dodgeBonus: -1,
    description: "Reduces dodge chance",
  },
  guard_stance: {
    id: "guard_stance",
    isBuff: true,
    blockBonus: 1,
    description: "Increases block chance",
  },
  off_balance: {
    id: "off_balance",
    isBuff: false,
    blockBonus: -1,
    description: "Reduces block chance",
  },
  haste: {
    id: "haste",
    isBuff: true,
    initiativeBonus: 1,
    description: "Increases initiative",
  },
  slow: {
    id: "slow",
    isBuff: false,
    initiativeBonus: -1,
    description: "Reduces initiative",
  },
  empower: {
    id: "empower",
    isBuff: true,
    physicalDamageBonus: 1,
    description: "Increases physical attack",
  },
  enfeeble: {
    id: "enfeeble",
    isBuff: false,
    physicalDamageBonus: -1,
    description: "Reduces physical attack",
  },
  arcane_surge: {
    id: "arcane_surge",
    isBuff: true,
    magicalDamageBonus: 1,
    description: "Increases magical attack",
  },
  arcane_drain: {
    id: "arcane_drain",
    isBuff: false,
    magicalDamageBonus: -1,
    description: "Reduces magical attack",
  },
};

// ─── Named Damage Matrices ────────────────────────────────────────────────────
//
// Each entry is a named, reusable damage matrix.
// levels[0] = level 1, levels[1] = level 2, etc.
// Multiple skills can share the same matrix name.

export const DAMAGE_MATRICES: Record<string, LeveledDamageMatrix> = {
  /** Single cell, 100% damage. */
  single: {
    levels: [
      // level 1
      { anchorRow: 0, anchorCol: 0, cells: [[P(1.0)]] },
      // level 2
      { anchorRow: 0, anchorCol: 0, cells: [[P(1.25)]] },
    ],
  },

  /**
   * Cross: center 100%, 4 orthogonal neighbours 20%.
   *   [ ]  [X]  [ ]
   *   [X]  [X]  [X]
   *   [ ]  [X]  [ ]
   */
  cross: {
    levels: [
      // level 1
      {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.2), null],
          [P(0.2), P(1.0), P(0.2)],
          [null, P(0.2), null],
        ],
      },
      // level 2
      {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.4), null],
          [P(0.4), P(1.0), P(0.4)],
          [null, P(0.4), null],
        ],
      },
    ],
  },

  /** All 3 cells in target row at 100%. */
  row_sweep: {
    levels: [
      // level 1
      { anchorRow: 0, anchorCol: 1, cells: [[P(1.0), P(1.0), P(1.0)]] },
      // level 2
      { anchorRow: 0, anchorCol: 1, cells: [[P(1.3), P(1.3), P(1.3)]] },
    ],
  },

  /** Target cell 100%, same column next row 50%. */
  pierce: {
    levels: [
      // level 1
      { anchorRow: 0, anchorCol: 0, cells: [[P(1.0)], [P(0.5)]] },
      // level 2
      { anchorRow: 0, anchorCol: 0, cells: [[P(1.0)], [P(0.75)]] },
    ],
  },
};

// ─── Named Effect Matrices ────────────────────────────────────────────────────
//
// Defines WHERE an effect lands (which cells) and with what multiplier.
// levels[0] = level 1, levels[1] = level 2, etc.
//
// For stat-based per-turn effects (regeneration / lose_health):
//   amountPerTurn = caster power (selected by powerSource) × anchorCell.damageMultiplier
// For defense-only effects (fortify / weaken / etc.):
//   only cell presence matters; damageMultiplier is unused

export const EFFECT_MATRICES: Record<string, LeveledDamageMatrix> = {
  /** Single target. Multiplier used for stat-based per-turn scaling. */
  single: {
    levels: [
      { anchorRow: 0, anchorCol: 0, cells: [[P(0.25)]] }, // level 1
      { anchorRow: 0, anchorCol: 0, cells: [[P(0.4)]] }, // level 2
      { anchorRow: 0, anchorCol: 0, cells: [[P(0.6)]] }, // level 3
    ],
  },

  /**
   * Cross: center + 4 orthogonal neighbours.
   * For defense-only effects: all neighbours share the same multiplier (unused).
   * For stat-based effects: anchor cell multiplier drives per-turn value.
   *   [ ]  [X]  [ ]
   *   [X]  [X]  [X]
   *   [ ]  [X]  [ ]
   */
  cross: {
    levels: [
      // level 1
      {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.2), null],
          [P(0.2), P(0.2), P(0.2)],
          [null, P(0.2), null],
        ],
      },
      // level 2 — TODO: set values
      {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.3), null],
          [P(0.3), P(0.3), P(0.3)],
          [null, P(0.3), null],
        ],
      },
    ],
  },
};

// ─── Leveled Effect Definitions ───────────────────────────────────────────────
//
// effectKind classifies which action type may use this effect.
// It does not choose periodic HP direction or scaling.
// Periodic HP direction and scaling are authored on apply_periodic_hp_effect.
//
// bonusByLevel — fixed-magnitude stat modifiers indexed by (level - 1).
//   No stat scaling. Sign is inherited from the base Effect in EFFECTS.

export const LEVELED_EFFECTS: Record<string, LeveledEffectDef> = {
  regeneration: {
    effectKind: 'periodic_hp',
    effect: EFFECTS.regeneration,
  },

  lose_health: {
    effectKind: 'periodic_hp',
    effect: EFFECTS.lose_health,
  },

  fortify: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.fortify,
    bonusByLevel: [10, 20, 30], // physicalDefenseBonus sign (+) inherited from EFFECTS.fortify
  },

  weaken: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.weaken,
    bonusByLevel: [10, 20, 30], // physicalDefenseBonus sign (-) inherited from EFFECTS.weaken
  },

  arcane_shield: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.arcane_shield,
    bonusByLevel: [10, 20, 30], // magicalDefenseBonus sign (+) inherited from EFFECTS.arcane_shield
  },

  arcane_vulnerability: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.arcane_vulnerability,
    bonusByLevel: [10, 20, 30], // magicalDefenseBonus sign (-) inherited from EFFECTS.arcane_vulnerability
  },

  swift: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.swift,
    bonusByLevel: [10, 20, 30], // dodgeBonus sign (+) inherited from EFFECTS.swift
  },

  clumsy: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.clumsy,
    bonusByLevel: [10, 20, 30], // dodgeBonus sign (-) inherited from EFFECTS.clumsy
  },

  guard_stance: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.guard_stance,
    bonusByLevel: [10, 20, 30], // blockBonus sign (+) inherited from EFFECTS.guard_stance
  },

  off_balance: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.off_balance,
    bonusByLevel: [10, 20, 30], // blockBonus sign (-) inherited from EFFECTS.off_balance
  },

  haste: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.haste,
    bonusByLevel: [1, 2, 3], // initiativeBonus sign (+) inherited from EFFECTS.haste
  },

  slow: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.slow,
    bonusByLevel: [1, 2, 3], // initiativeBonus sign (-) inherited from EFFECTS.slow
  },

  empower: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.empower,
    bonusByLevel: [10, 20, 30], // physicalDamageBonus sign (+) inherited from EFFECTS.empower
  },

  enfeeble: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.enfeeble,
    bonusByLevel: [10, 20, 30], // physicalDamageBonus sign (-) inherited from EFFECTS.enfeeble
  },

  arcane_surge: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.arcane_surge,
    bonusByLevel: [10, 20, 30], // magicalDamageBonus sign (+) inherited from EFFECTS.arcane_surge
  },

  arcane_drain: {
    effectKind: 'stat_modifier',
    effect: EFFECTS.arcane_drain,
    bonusByLevel: [10, 20, 30], // magicalDamageBonus sign (-) inherited from EFFECTS.arcane_drain
  },
};

// ─── Named Instant Effect Matrices ───────────────────────────────────────────
//
// Cell values are stored in damageMultiplier but represent success PROBABILITY (0–1),
// not a damage scaling factor. Instant effects are not damage; they are provoke/distract.
// Dodge / block / defense do NOT apply to this roll.
// levels[0] = level 1, levels[1] = level 2, etc.

export const INSTANT_EFFECT_MATRICES: Record<string, LeveledDamageMatrix> = {
  /** Single target. */
  single: {
    levels: [
      { anchorRow: 0, anchorCol: 0, cells: [[P(0.6)]] },
      { anchorRow: 0, anchorCol: 0, cells: [[P(1)]] },
      { anchorRow: 0, anchorCol: 0, cells: [[P(1)]] },
      { anchorRow: 0, anchorCol: 0, cells: [[P(1)]] },
    ],
  },

  /** 3 cells in one row. */
  row_sweep: {
    levels: [
      {
        anchorRow: 0,
        anchorCol: 1,
        cells: [[P(0.6), P(0.6), P(0.6)]],
      },
    ],
  },

  /** 2 cells in one row. */
  shot_sweep: {
    levels: [
      {
        anchorRow: 0,
        anchorCol: 0,
        cells: [[P(0.5), P(0.5)]],
      },
      {
        anchorRow: 0,
        anchorCol: 0,
        cells: [[P(0.8), P(0.8)]],
      },
    ],
  },

  /** 3x3 area. */
  all: {
    levels: [
      {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [P(0.3), P(0.3), P(0.3)],
          [P(0.3), P(0.3), P(0.3)],
          [P(0.3), P(0.3), P(0.3)],
        ],
      },
      {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [P(0.4), P(0.4), P(0.4)],
          [P(0.4), P(0.4), P(0.4)],
          [P(0.4), P(0.4), P(0.4)],
        ],
      },
      {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [P(0.5), P(0.5), P(0.5)],
          [P(0.5), P(0.5), P(0.5)],
          [P(0.5), P(0.5), P(0.5)],
        ],
      },
      {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [P(1), P(1), P(1)],
          [P(1), P(1), P(1)],
          [P(1), P(1), P(1)],
        ],
      },
    ],
  },

  /**
   * Cross: center + 4 orthogonal neighbours.
   */
  cross: {
    levels: [
      {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.5), null],
          [P(0.5), P(0.1), P(0.5)],
          [null, P(0.5), null],
        ],
      },
      {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.4), null],
          [P(0.4), P(0.7), P(0.4)],
          [null, P(0.4), null],
        ],
      },
      {
        anchorRow: 1,
        anchorCol: 1,
        cells: [
          [null, P(0.3), null],
          [P(0.3), P(1), P(0.3)],
          [null, P(0.3), null],
        ],
      },
    ],
  },

  /** Main target + one additional target. */
  pierce: {
    levels: [
      {
        anchorRow: 0,
        anchorCol: 0,
        cells: [[P(0.75), P(1)]],
      },
    ],
  },
};

// ─── Damage Modifier Levels ───────────────────────────────────────────────────
// Values are percentages (0–100) of the stat that is IGNORED.
// Index 0 = level 1, index 1 = level 2, etc.

export const DAMAGE_MODIFIER_LEVELS: Record<DamageModifierType, number[]> = {
  ignore_block: [25, 50, 75, 100],
  ignore_dodge: [25, 50, 75, 100],
  ignore_physical_defense: [25, 50, 75, 100],
  ignore_magical_defense: [25, 50, 75, 100],
};

// ─── Vampirism Levels ─────────────────────────────────────────────────────────
// Values are % of total real damage converted to HP.
// Index 0 = level 1, index 1 = level 2, etc.

export const VAMPIRISM_LEVELS: number[] = [25, 50, 100];

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
        matrix: { kind: "damage_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "cross", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "row_sweep", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "pierce", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "single", level: 1 },
      },
      {
        type: "instant_effect",
        instantEffectType: "provoke",
        displayName: "Provoke",
        matrix: { kind: "instant_effect_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "single", level: 1 },
      },
      {
        type: "instant_effect",
        instantEffectType: "distract",
        displayName: "Distract",
        matrix: { kind: "instant_effect_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "single", level: 1 },
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
        matrix: { kind: "damage_matrix", matrixName: "row_sweep", level: 1 },
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
