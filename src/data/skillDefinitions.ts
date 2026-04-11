import { Effect, Skill } from "../battle/types";
import { PATTERNS } from "../battle/skillPatterns";

export const EFFECTS: Record<string, Effect> = {
  regeneration: {
    id: "regeneration",
    isBuff: true,
    healPerTurn: 15,
  },
  poison: {
    id: "poison",
    isBuff: false,
    damagePerTurn: 15,
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
    actionType: "enchantment",
    damageBlock: { pattern: PATTERNS.single, damageType: "physical" },
  },

  arcane_cross: {
    id: "arcane_cross",
    name: "Arcane Cross",
    actionType: "ranged",
    damageBlock: { pattern: PATTERNS.cross, damageType: "magical" },
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
      effect: EFFECTS.poison,
      duration: 3,
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
    },
  },
};
