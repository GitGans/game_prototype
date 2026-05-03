import type { ActionSkillDefinition } from "../../../src/shared/skillDefinitionTypes";

/** Single-cell physical melee attack. */
export const testStrike: ActionSkillDefinition = {
  definitionKind: "action_skill",
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
  definitionKind: "action_skill",
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
  definitionKind: "action_skill",
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

/** Single-target vampirism attack (for vampirism cap tests). */
export const testVampireStrike: ActionSkillDefinition = {
  definitionKind: "action_skill",
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
