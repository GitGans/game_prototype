import { Effect, Skill, SkillPattern } from "../battle/types";
import { PATTERNS } from "../battle/skillPatterns";

// ─── Helper ───────────────────────────────────────────────────────────────────

const P = (m: number) => ({ damageMultiplier: m });

// ─── Effect Pattern Presets ───────────────────────────────────────────────────

export const EFFECT_PATTERNS: Record<string, SkillPattern> = {
  /**
   * Cross pattern for effect application. All 5 cells have equal multiplier 0.2.
   *
   *   [ ]  [X]  [ ]
   *   [X]  [X]  [X]   ← anchor at center (row 1, col 1)
   *   [ ]  [X]  [ ]
   */
  cross: {
    anchorRow: 1,
    anchorCol: 1,
    cells: [
      [null,    P(0.2), null  ],
      [P(0.2),  P(0.2), P(0.2)],
      [null,    P(0.2), null  ],
    ],
  },
};

// ─── Effect Definitions ───────────────────────────────────────────────────────

export const EFFECTS: Record<string, Effect> = {
  regeneration: {
    id: "regeneration",
    isBuff: true,
  },
  lose_health: {
    id: "lose_health",
    isBuff: false,
  },
  fortify: {
    id: "fortify",
    isBuff: true,
    physicalDefenseBonus: 20,
  },
  weaken: {
    id: "weaken",
    isBuff: false,
    physicalDefenseBonus: -20,
  },
  arcane_shield: {
    id: "arcane_shield",
    isBuff: true,
    magicalDefenseBonus: 20,
  },
  arcane_vulnerability: {
    id: "arcane_vulnerability",
    isBuff: false,
    magicalDefenseBonus: -20,
  },
};

// ─── Skill Definitions ────────────────────────────────────────────────────────

export const SKILLS: Record<string, Skill> = {
  basic_melee: {
    id: "basic_melee",
    name: "Strike",
    actionType: "melee",
    damageBlock: { pattern: PATTERNS.single, damageType: "physical" },
  },

  basic_ranged: {
    id: "basic_ranged",
    name: "Shot",
    actionType: "ranged",
    damageBlock: { pattern: PATTERNS.single, damageType: "physical" },
  },

  basic_heal: {
    id: "basic_heal",
    name: "Heal",
    actionType: "mass_enchantment",
    damageBlock: { pattern: PATTERNS.single, damageType: "magical" },
  },

  heal_with_defence: {
    id: "heal_with_defence",
    name: "Protective Heal",
    actionType: "mass_enchantment",
    damageBlock: { pattern: PATTERNS.single, damageType: "magical" },
    effectBlock: {
      pattern: PATTERNS.single,
      effectName: "Defence",
      effect: EFFECTS.fortify,
      duration: 2,
      damageType: "physical",
    },
  },

  self_heal_mass_regeneration: {
    id: "self_heal_mass_regeneration",
    name: "Regenerative Heal",
    actionType: "self_enchantment",
    damageBlock: { pattern: PATTERNS.single, damageType: "magical" },
    effectBlock: {
      pattern: PATTERNS.cross,
      effectName: "Regeneration",
      effect: EFFECTS.regeneration,
      duration: 2,
      damageType: "magical",
    },
  },

  arcane_cross: {
    id: "arcane_cross",
    name: "Arcane Cross",
    actionType: "ranged",
    damageBlock: { pattern: PATTERNS.cross, damageType: "magical" },
    effectBlock: {
      pattern: EFFECT_PATTERNS.cross,
      effectName: "Arcane Burn",
      effect: EFFECTS.lose_health,
      duration: 2,
      damageType: "magical",
    },
  },

  row_strike: {
    id: "row_strike",
    name: "Row Strike",
    actionType: "melee",
    damageBlock: { pattern: PATTERNS.row_sweep, damageType: "physical" },
  },

  pierce: {
    id: "pierce",
    name: "Pierce",
    actionType: "melee",
    damageBlock: { pattern: PATTERNS.pierce, damageType: "physical" },
  },

  poison_strike: {
    id: "poison_strike",
    name: "Poison Strike",
    actionType: "melee",
    damageBlock: { pattern: PATTERNS.single, damageType: "physical" },
    effectBlock: {
      pattern: PATTERNS.single,
      effectName: "Poisoned",
      effect: EFFECTS.lose_health,
      duration: 3,
      damageType: "physical",
    },
  },

  weaken_curse: {
    id: "weaken_curse",
    name: "Weaken Curse",
    actionType: "ranged",
    effectBlock: {
      pattern: PATTERNS.single,
      effectName: "Weakened",
      effect: EFFECTS.weaken,
      duration: 2,
      damageType: "physical",
    },
  },
};
