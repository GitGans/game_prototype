import type { ActionSkillDefinition, SkillId } from "../../shared/skillDefinitionTypes";

// ─── Skill Definitions ────────────────────────────────────────────────────────

export const SKILLS = {
  p_melee_basic: {
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
        matrix: {
          kind: "multiplier_matrix",
          matrixName: "cross_flat",
          level: 1,
        },
      },
    ],
  },

  arcane_cross: {
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
        matrix: {
          kind: "multiplier_matrix",
          matrixName: "cross_flat",
          level: 1,
        },
      },
    ],
  },

  row_strike: {
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
} satisfies Record<string, ActionSkillDefinition>;

/**
 * Returns a validated SkillId for the given registry key.
 *
 * This is the ONLY authorised way to produce a SkillId in content authoring.
 * Do NOT write `"skill_name" as SkillId` — that bypasses validation.
 *
 * Usage:
 *   baseSkillId: sid("p_melee_basic")
 */
export function sid(id: keyof typeof SKILLS): SkillId {
  return id as SkillId;
}
