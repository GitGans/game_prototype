import type { Skill } from "../../../src/battle/types";

/** Single-cell physical melee attack. */
export const testStrike: Skill = {
  id: "test_strike",
  name: "Test Strike",
  actionType: "melee",
  damageBlock: {
    matrixName: "single",
    damageType: "physical",
    level: 1,
  },
};

/** Single-cell magical ranged attack. */
export const testMagicBolt: Skill = {
  id: "test_magic_bolt",
  name: "Test Magic Bolt",
  actionType: "ranged",
  damageBlock: {
    matrixName: "single",
    damageType: "magical",
    level: 1,
  },
};

/** Full-row physical attack (for AOE / dedup tests). Uses the production "row_sweep" matrix. */
export const testRowStrike: Skill = {
  id: "test_row_strike",
  name: "Test Row Strike",
  actionType: "melee",
  damageBlock: {
    matrixName: "row_sweep",
    damageType: "physical",
    level: 1,
  },
};

/** Single-target vampirism attack (for vampirism cap tests). */
export const testVampireStrike: Skill = {
  id: "test_vampire_strike",
  name: "Test Vampire Strike",
  actionType: "melee",
  damageBlock: {
    matrixName: "single",
    damageType: "physical",
    level: 1,
  },
  postDamageBlock: {
    type: "mass_vampirism",
    level: 1,
  },
};
