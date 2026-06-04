import type { ActionSkillDefinition } from "../../../src/shared/skillDefinitionTypes";

/** Single-cell physical melee attack. */
export const testStrike: ActionSkillDefinition = {
  id: "test_strike",
  name: "Test Strike",
  targetPolicy: { type: "enemy_melee" },
  actions: [
    {
      type: "damage",
      powerSource: "physical_strength",
      matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
    },
  ],
};

/** Single-cell magical ranged attack. */
export const testMagicBolt: ActionSkillDefinition = {
  id: "test_magic_bolt",
  name: "Test Magic Bolt",
  targetPolicy: { type: "enemy_ranged" },
  actions: [
    {
      type: "damage",
      powerSource: "magical_strength",
      matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
    },
  ],
};

/** Full-row physical attack (for AOE / dedup tests). Uses the production "row_sweep" matrix. */
export const testRowStrike: ActionSkillDefinition = {
  id: "test_row_strike",
  name: "Test Row Strike",
  targetPolicy: { type: "enemy_melee" },
  actions: [
    {
      type: "damage",
      powerSource: "physical_strength",
      matrix: { kind: "multiplier_matrix", matrixName: "row_sweep", level: 1 },
    },
  ],
};

/** Single-target heal on alive friendly. */
export const testHeal: ActionSkillDefinition = {
  id: "test_heal",
  name: "Test Heal",
  targetPolicy: { type: "alive_friendly" },
  actions: [
    {
      type: "heal",
      powerSource: "magical_strength",
      matrix: { kind: "multiplier_matrix", matrixName: "single", level: 1 },
    },
  ],
};

/** Single-target revive on a dead friendly. */
export const testRevive: ActionSkillDefinition = {
  id: "test_revive",
  name: "Test Revive",
  targetPolicy: { type: "dead_friendly" },
  actions: [
    {
      type: "revive",
      level: 1,
      matrix: { kind: "effect_area_matrix", matrixName: "single" },
    },
  ],
};

/** Single-target vampirism attack (for vampirism cap tests). */
export const testVampireStrike: ActionSkillDefinition = {
  id: "test_vampire_strike",
  name: "Test Vampire Strike",
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
      level: 1,
    },
  ],
};
