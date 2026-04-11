import { Skill } from "../battle/types";
import { PATTERNS } from "../battle/skillPatterns";

export const SKILLS: Record<string, Skill> = {
  basic_melee: {
    id: "basic_melee",
    name: "Strike",
    actionType: "melee",
    damageType: "physical",
    pattern: PATTERNS.single,
  },

  basic_ranged: {
    id: "basic_ranged",
    name: "Shot",
    actionType: "ranged",
    damageType: "physical",
    pattern: PATTERNS.single,
  },

  basic_heal: {
    id: "basic_heal",
    name: "Heal",
    actionType: "enchantment",
    damageType: "physical",
    pattern: PATTERNS.single,
  },

  arcane_cross: {
    id: "arcane_cross",
    name: "Arcane Cross",
    actionType: "ranged",
    damageType: "magical",
    pattern: PATTERNS.cross,
  },

  row_strike: {
    id: "row_strike",
    name: "Row Strike",
    actionType: "melee",
    damageType: "physical",
    pattern: PATTERNS.row_sweep,
  },

  pierce: {
    id: "pierce",
    name: "Pierce",
    actionType: "melee",
    damageType: "physical",
    pattern: PATTERNS.pierce,
  },
};
