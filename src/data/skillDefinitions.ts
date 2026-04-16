import {
  DamageType,
  Effect,
  LeveledDamageMatrix,
  LeveledEffectDef,
  Skill,
  SkillEffectBlock,
  SkillPattern,
} from "../battle/types";

// ─── Helper ───────────────────────────────────────────────────────────────────

const P = (m: number) => ({ damageMultiplier: m });

// ─── Base Effects ─────────────────────────────────────────────────────────────

const EFFECTS: Record<string, Effect> = {
  regeneration:         { id: "regeneration",         isBuff: true,  description: "Restores HP each round" },
  lose_health:          { id: "lose_health",           isBuff: false, description: "Deals damage each round" },
  fortify:              { id: "fortify",               isBuff: true,  physicalDefenseBonus:  1, description: "Increases physical defense" },
  weaken:               { id: "weaken",                isBuff: false, physicalDefenseBonus: -1, description: "Reduces physical defense" },
  arcane_shield:        { id: "arcane_shield",         isBuff: true,  magicalDefenseBonus:   1, description: "Increases magical defense" },
  arcane_vulnerability: { id: "arcane_vulnerability",  isBuff: false, magicalDefenseBonus:  -1, description: "Reduces magical defense" },
  swift:                { id: "swift",                 isBuff: true,  dodgeBonus:  1, description: "Increases dodge chance" },
  clumsy:               { id: "clumsy",                isBuff: false, dodgeBonus: -1, description: "Reduces dodge chance" },
  guard_stance:         { id: "guard_stance",          isBuff: true,  blockBonus:  1, description: "Increases block chance" },
  off_balance:          { id: "off_balance",           isBuff: false, blockBonus: -1, description: "Reduces block chance" },
  haste:                { id: "haste",                 isBuff: true,  initiativeBonus:  1, description: "Increases initiative" },
  slow:                 { id: "slow",                  isBuff: false, initiativeBonus: -1, description: "Reduces initiative" },
  empower:              { id: "empower",               isBuff: true,  physicalDamageBonus:  1, description: "Increases physical attack" },
  enfeeble:             { id: "enfeeble",              isBuff: false, physicalDamageBonus: -1, description: "Reduces physical attack" },
  arcane_surge:         { id: "arcane_surge",          isBuff: true,  magicalDamageBonus:   1, description: "Increases magical attack" },
  arcane_drain:         { id: "arcane_drain",          isBuff: false, magicalDamageBonus:  -1, description: "Reduces magical attack" },
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
//   computedPerTurn = casterStat × anchorCell.damageMultiplier
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

// ─── Named Leveled Effects ────────────────────────────────────────────────────
//
// Two modes (mutually exclusive):
// - effectDamageType → per-turn value = casterStat × effect matrix anchor multiplier
// - bonusByLevel     → fixed defense bonus magnitude per level; sign from base Effect

export const LEVELED_EFFECTS: Record<string, LeveledEffectDef> = {
  regeneration: {
    effect: EFFECTS.regeneration,
    effectDamageType: "magical", // computedPerTurn = magicalDamage × matrix multiplier
  },

  lose_health: {
    effect: EFFECTS.lose_health,
    effectDamageType: "physical", // computedPerTurn = physicalDamage × matrix multiplier
  },

  fortify: {
    effect: EFFECTS.fortify,
    bonusByLevel: [10, 20, 30], // physicalDefenseBonus sign (+) inherited from EFFECTS.fortify
  },

  weaken: {
    effect: EFFECTS.weaken,
    bonusByLevel: [10, 20, 30], // physicalDefenseBonus sign (-) inherited from EFFECTS.weaken
  },

  arcane_shield: {
    effect: EFFECTS.arcane_shield,
    bonusByLevel: [10, 20, 30], // magicalDefenseBonus sign (+) inherited from EFFECTS.arcane_shield
  },

  arcane_vulnerability: {
    effect: EFFECTS.arcane_vulnerability,
    bonusByLevel: [10, 20, 30], // magicalDefenseBonus sign (-) inherited from EFFECTS.arcane_vulnerability
  },

  swift: {
    effect: EFFECTS.swift,
    bonusByLevel: [10, 20, 30], // dodgeBonus sign (+) inherited from EFFECTS.swift
  },

  clumsy: {
    effect: EFFECTS.clumsy,
    bonusByLevel: [10, 20, 30], // dodgeBonus sign (-) inherited from EFFECTS.clumsy
  },

  guard_stance: {
    effect: EFFECTS.guard_stance,
    bonusByLevel: [10, 20, 30], // blockBonus sign (+) inherited from EFFECTS.guard_stance
  },

  off_balance: {
    effect: EFFECTS.off_balance,
    bonusByLevel: [10, 20, 30], // blockBonus sign (-) inherited from EFFECTS.off_balance
  },

  haste: {
    effect: EFFECTS.haste,
    bonusByLevel: [1, 2, 3], // initiativeBonus sign (+) inherited from EFFECTS.haste
  },

  slow: {
    effect: EFFECTS.slow,
    bonusByLevel: [1, 2, 3], // initiativeBonus sign (-) inherited from EFFECTS.slow
  },

  empower: {
    effect: EFFECTS.empower,
    bonusByLevel: [10, 20, 30], // physicalDamageBonus sign (+) inherited from EFFECTS.empower
  },

  enfeeble: {
    effect: EFFECTS.enfeeble,
    bonusByLevel: [10, 20, 30], // physicalDamageBonus sign (-) inherited from EFFECTS.enfeeble
  },

  arcane_surge: {
    effect: EFFECTS.arcane_surge,
    bonusByLevel: [10, 20, 30], // magicalDamageBonus sign (+) inherited from EFFECTS.arcane_surge
  },

  arcane_drain: {
    effect: EFFECTS.arcane_drain,
    bonusByLevel: [10, 20, 30], // magicalDamageBonus sign (-) inherited from EFFECTS.arcane_drain
  },
};

// ─── Runtime Resolution Helpers ───────────────────────────────────────────────

/**
 * Returns the SkillPattern for the skill's damageBlock level from DAMAGE_MATRICES.
 * Falls back to level 1 if level exceeds the matrix's defined levels.
 */
export function getSkillPattern(skill: Skill): SkillPattern {
  const db = skill.damageBlock!;
  const matrix = DAMAGE_MATRICES[db.matrixName];
  return matrix.levels[db.level - 1] ?? matrix.levels[0];
}

/**
 * Returns the SkillPattern for an effectBlock's level from EFFECT_MATRICES.
 * Falls back to level 1 if level exceeds the matrix's defined levels.
 */
export function getEffectPattern(block: SkillEffectBlock): SkillPattern {
  const matrix = EFFECT_MATRICES[block.effectMatrixName];
  return matrix.levels[block.level - 1] ?? matrix.levels[0];
}

// ─── Skill Definitions ────────────────────────────────────────────────────────

export const SKILLS: Record<string, Skill> = {
  basic_melee: {
    id: "basic_melee",
    name: "Strike",
    actionType: "melee",
    damageBlock: { matrixName: "single", damageType: "physical", level: 1 },
  },

  basic_ranged: {
    id: "basic_ranged",
    name: "Shot",
    actionType: "ranged",
    damageBlock: { matrixName: "single", damageType: "physical", level: 1 },
  },

  slowing_ranged: {
    id: "slowing_ranged",
    name: "Arrow that breaks legs",
    actionType: "ranged",
    damageBlock: { matrixName: "single", damageType: "physical", level: 1 },
    effectBlock: {
      effectMatrixName: "single",
      level: 1,
      effectDisplayName: "Slow",
      effectName: "slow",
      duration: 2,
      damageType: "physical",
    },
  },

  basic_heal: {
    id: "basic_heal",
    name: "Heal",
    actionType: "mass_enchantment",
    damageBlock: { matrixName: "single", damageType: "magical", level: 1 },
  },

  heal_with_defence: {
    id: "heal_with_defence",
    name: "Protective Heal",
    actionType: "mass_enchantment",
    damageBlock: { matrixName: "single", damageType: "magical", level: 1 },
    effectBlock: {
      effectMatrixName: "single",
      level: 1,
      effectDisplayName: "Defence",
      effectName: "fortify",
      duration: 2,
      damageType: "physical",
    },
  },

  self_heal_mass_regeneration: {
    id: "self_heal_mass_regeneration",
    name: "Regenerative Heal",
    actionType: "self_enchantment",
    damageBlock: { matrixName: "single", damageType: "magical", level: 1 },
    effectBlock: {
      effectMatrixName: "cross",
      level: 1,
      effectDisplayName: "Regeneration",
      effectName: "regeneration",
      duration: 2,
      damageType: "magical",
    },
  },

  arcane_cross: {
    id: "arcane_cross",
    name: "Arcane Cross",
    actionType: "ranged",
    damageBlock: { matrixName: "cross", damageType: "magical", level: 1 },
    effectBlock: {
      effectMatrixName: "cross",
      level: 1,
      effectDisplayName: "Arcane Burn",
      effectName: "lose_health",
      duration: 2,
      damageType: "magical",
    },
  },

  row_strike: {
    id: "row_strike",
    name: "Row Strike",
    actionType: "melee",
    damageBlock: { matrixName: "row_sweep", damageType: "physical", level: 1 },
  },

  pierce: {
    id: "pierce",
    name: "Pierce",
    actionType: "melee",
    damageBlock: { matrixName: "pierce", damageType: "physical", level: 1 },
  },

  poison_strike: {
    id: "poison_strike",
    name: "Poison Strike",
    actionType: "melee",
    damageBlock: { matrixName: "single", damageType: "physical", level: 1 },
    effectBlock: {
      effectMatrixName: "single",
      level: 1,
      effectDisplayName: "Poisoned",
      effectName: "lose_health",
      duration: 3,
      damageType: "physical",
    },
  },

  weaken_curse: {
    id: "weaken_curse",
    name: "Weaken Curse",
    actionType: "ranged",
    effectBlock: {
      effectMatrixName: "single",
      level: 1,
      effectDisplayName: "Weakened",
      effectName: "weaken",
      duration: 2,
      damageType: "physical",
    },
  },
};
