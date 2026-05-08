import type { UnitUpgradeTier } from "../../shared/unitTypes";
import { sid } from "../skills";
import { opt } from "./upgradeOptionHelpers";

type PlayerUnitTemplateId =
  | "soldier"
  | "warrior"
  | "guard"
  | "brawler"
  | "marksman"
  | "forest_ranger"
  | "elementalist"
  | "monk"
  | "troublemaker"
  | "healer"
  | "shaman"
  | "destroyer";

export const PLAYER_UNIT_UPGRADE_TIERS = {
  soldier: [
    {
      unlocksAtLevel: 5,
      options: [
        opt("soldier_5_row_strike", "Row Strike", sid("row_strike")),
        opt("soldier_5_pierce", "Pierce", sid("pierce"), {
          description: "Gain Pierce and become tougher.",
          statModifiers: { hp: 20 },
          spriteSheet: {
            path: "assets/sprites/units/soldier_elite.png",
            frameWidth: 128,
            frameHeight: 128,
            states: ["idle", "attack", "death"] as const,
          },
        }),
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        opt("soldier_10_poison_strike", "Poison Strike", sid("poison_strike")),
        opt("soldier_10_provoke_strike", "Provoke", sid("provoke_strike"), {
          description: "Gain Provoke Strike and act earlier in battle.",
          statModifiers: { initiative: 2 },
        }),
      ],
    },
    {
      unlocksAtLevel: 15,
      options: [
        opt("soldier_15_armor_pierce", "Armor Pierce", sid("armor_pierce")),
        opt("soldier_15_drain_strike", "Drain Strike", sid("drain_strike")),
      ],
    },
    {
      unlocksAtLevel: 20,
      options: [
        opt("soldier_20_life_sweep", "Life Sweep", sid("life_sweep")),
        opt("soldier_20_armor_pierce", "Armor Pierce", sid("armor_pierce")),
      ],
    },
  ],
  warrior: [
    {
      unlocksAtLevel: 5,
      options: [
        opt("warrior_5_row_strike", "Row Strike", sid("row_strike")),
        opt("warrior_5_provoke_strike", "Provoke", sid("provoke_strike")),
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        opt("warrior_10_pierce", "Pierce", sid("pierce")),
        opt("warrior_10_poison_strike", "Poison Strike", sid("poison_strike")),
      ],
    },
    {
      unlocksAtLevel: 15,
      options: [
        opt("warrior_15_armor_pierce", "Armor Pierce", sid("armor_pierce")),
        opt("warrior_15_drain_strike", "Drain Strike", sid("drain_strike")),
      ],
    },
    {
      unlocksAtLevel: 20,
      options: [
        opt("warrior_20_life_sweep", "Life Sweep", sid("life_sweep")),
        opt("warrior_20_drain_strike", "Drain Strike", sid("drain_strike")),
      ],
    },
  ],
  guard: [
    {
      unlocksAtLevel: 5,
      options: [
        opt("guard_5_pierce", "Pierce", sid("pierce")),
        opt("guard_5_provoke_strike", "Provoke", sid("provoke_strike")),
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        opt("guard_10_row_strike", "Row Strike", sid("row_strike")),
        opt("guard_10_armor_pierce", "Armor Pierce", sid("armor_pierce")),
      ],
    },
    {
      unlocksAtLevel: 15,
      options: [
        opt("guard_15_poison_strike", "Poison Strike", sid("poison_strike")),
        opt("guard_15_drain_strike", "Drain Strike", sid("drain_strike")),
      ],
    },
    {
      unlocksAtLevel: 20,
      options: [
        opt("guard_20_life_sweep", "Life Sweep", sid("life_sweep")),
        opt("guard_20_armor_pierce", "Armor Pierce", sid("armor_pierce")),
      ],
    },
  ],
  brawler: [
    {
      unlocksAtLevel: 5,
      options: [
        opt("brawler_5_poison_strike", "Poison Strike", sid("poison_strike")),
        opt("brawler_5_provoke_strike", "Provoke", sid("provoke_strike")),
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        opt("brawler_10_pierce", "Pierce", sid("pierce")),
        opt("brawler_10_row_strike", "Row Strike", sid("row_strike")),
      ],
    },
    {
      unlocksAtLevel: 15,
      options: [
        opt("brawler_15_drain_strike", "Drain Strike", sid("drain_strike")),
        opt("brawler_15_armor_pierce", "Armor Pierce", sid("armor_pierce")),
      ],
    },
    {
      unlocksAtLevel: 20,
      options: [
        opt("brawler_20_life_sweep", "Life Sweep", sid("life_sweep")),
        opt("brawler_20_drain_strike", "Drain Strike", sid("drain_strike")),
      ],
    },
  ],
  marksman: [
    {
      unlocksAtLevel: 5,
      options: [
        opt("marksman_5_p_ranged_slowing", "Arrow that breaks legs", sid("p_ranged_slowing")),
        opt("marksman_5_distract_shot", "Distract", sid("distract_shot")),
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        opt("marksman_10_pierce", "Pierce", sid("pierce")),
        opt("marksman_10_armor_pierce", "Armor Pierce", sid("armor_pierce")),
      ],
    },
    {
      unlocksAtLevel: 15,
      options: [
        opt("marksman_15_poison_strike", "Poison Strike", sid("poison_strike")),
        opt("marksman_15_drain_strike", "Drain Strike", sid("drain_strike")),
      ],
    },
    {
      unlocksAtLevel: 20,
      options: [
        opt("marksman_20_life_sweep", "Life Sweep", sid("life_sweep")),
        opt("marksman_20_armor_pierce", "Armor Pierce", sid("armor_pierce")),
      ],
    },
  ],
  forest_ranger: [
    {
      unlocksAtLevel: 5,
      options: [
        opt("forest_ranger_5_distract_shot", "Distract", sid("distract_shot")),
        opt("forest_ranger_5_p_ranged_slowing", "Arrow that breaks legs", sid("p_ranged_slowing")),
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        opt("forest_ranger_10_poison_strike", "Poison Strike", sid("poison_strike")),
        opt("forest_ranger_10_pierce", "Pierce", sid("pierce")),
      ],
    },
    {
      unlocksAtLevel: 15,
      options: [
        opt("forest_ranger_15_armor_pierce", "Armor Pierce", sid("armor_pierce")),
        opt("forest_ranger_15_drain_strike", "Drain Strike", sid("drain_strike")),
      ],
    },
    {
      unlocksAtLevel: 20,
      options: [
        opt("forest_ranger_20_life_sweep", "Life Sweep", sid("life_sweep")),
        opt("forest_ranger_20_drain_strike", "Drain Strike", sid("drain_strike")),
      ],
    },
  ],
  elementalist: [
    {
      unlocksAtLevel: 5,
      options: [
        opt("elementalist_5_arcane_cross", "Arcane Cross", sid("arcane_cross")),
        opt("elementalist_5_weaken_curse", "Weaken Curse", sid("weaken_curse")),
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        opt("elementalist_10_arcane_cross", "Arcane Cross", sid("arcane_cross")),
        opt("elementalist_10_m_ranged_basic", "Magic Shot", sid("m_ranged_basic")),
      ],
    },
    {
      unlocksAtLevel: 15,
      options: [
        opt("elementalist_15_weaken_curse", "Weaken Curse", sid("weaken_curse")),
        opt("elementalist_15_arcane_cross", "Arcane Cross", sid("arcane_cross")),
      ],
    },
    {
      unlocksAtLevel: 20,
      options: [
        opt("elementalist_20_arcane_cross", "Arcane Cross", sid("arcane_cross")),
        opt("elementalist_20_weaken_curse", "Weaken Curse", sid("weaken_curse")),
      ],
    },
  ],
  monk: [
    {
      unlocksAtLevel: 5,
      options: [
        opt("monk_5_weaken_curse", "Weaken Curse", sid("weaken_curse")),
        opt("monk_5_arcane_cross", "Arcane Cross", sid("arcane_cross")),
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        opt("monk_10_arcane_cross", "Arcane Cross", sid("arcane_cross")),
        opt("monk_10_m_ranged_basic", "Magic Shot", sid("m_ranged_basic")),
      ],
    },
    {
      unlocksAtLevel: 15,
      options: [
        opt("monk_15_arcane_cross", "Arcane Cross", sid("arcane_cross")),
        opt("monk_15_weaken_curse", "Weaken Curse", sid("weaken_curse")),
      ],
    },
    {
      unlocksAtLevel: 20,
      options: [
        opt("monk_20_weaken_curse", "Weaken Curse", sid("weaken_curse")),
        opt("monk_20_arcane_cross", "Arcane Cross", sid("arcane_cross")),
      ],
    },
  ],
  troublemaker: [
    {
      unlocksAtLevel: 5,
      options: [
        opt("troublemaker_5_arcane_cross", "Arcane Cross", sid("arcane_cross")),
        opt("troublemaker_5_weaken_curse", "Weaken Curse", sid("weaken_curse")),
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        opt("troublemaker_10_weaken_curse", "Weaken Curse", sid("weaken_curse")),
        opt("troublemaker_10_arcane_cross", "Arcane Cross", sid("arcane_cross")),
      ],
    },
    {
      unlocksAtLevel: 15,
      options: [
        opt("troublemaker_15_arcane_cross", "Arcane Cross", sid("arcane_cross")),
        opt("troublemaker_15_m_ranged_basic", "Magic Shot", sid("m_ranged_basic")),
      ],
    },
    {
      unlocksAtLevel: 20,
      options: [
        opt("troublemaker_20_weaken_curse", "Weaken Curse", sid("weaken_curse")),
        opt("troublemaker_20_arcane_cross", "Arcane Cross", sid("arcane_cross")),
      ],
    },
  ],
  healer: [
    {
      unlocksAtLevel: 5,
      options: [
        opt("healer_5_heal_with_defence", "Protective Heal", sid("heal_with_defence")),
        opt("healer_5_self_heal_mass_regeneration", "Regenerative Heal", sid("self_heal_mass_regeneration")),
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        opt("healer_10_self_heal_mass_regeneration", "Regenerative Heal", sid("self_heal_mass_regeneration")),
        opt("healer_10_heal_with_defence", "Protective Heal", sid("heal_with_defence")),
      ],
    },
    {
      unlocksAtLevel: 15,
      options: [
        opt("healer_15_heal_with_defence", "Protective Heal", sid("heal_with_defence")),
        opt("healer_15_m_heal_basic", "Heal", sid("m_heal_basic")),
      ],
    },
    {
      unlocksAtLevel: 20,
      options: [
        opt("healer_20_self_heal_mass_regeneration", "Regenerative Heal", sid("self_heal_mass_regeneration")),
        opt("healer_20_heal_with_defence", "Protective Heal", sid("heal_with_defence")),
      ],
    },
  ],
  shaman: [
    {
      unlocksAtLevel: 5,
      options: [
        opt("shaman_5_arcane_cross", "Arcane Cross", sid("arcane_cross")),
        opt("shaman_5_weaken_curse", "Weaken Curse", sid("weaken_curse")),
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        opt("shaman_10_weaken_curse", "Weaken Curse", sid("weaken_curse")),
        opt("shaman_10_m_ranged_basic", "Magic Shot", sid("m_ranged_basic")),
      ],
    },
    {
      unlocksAtLevel: 15,
      options: [
        opt("shaman_15_arcane_cross", "Arcane Cross", sid("arcane_cross")),
        opt("shaman_15_weaken_curse", "Weaken Curse", sid("weaken_curse")),
      ],
    },
    {
      unlocksAtLevel: 20,
      options: [
        opt("shaman_20_arcane_cross", "Arcane Cross", sid("arcane_cross")),
        opt("shaman_20_m_ranged_basic", "Magic Shot", sid("m_ranged_basic")),
      ],
    },
  ],
  destroyer: [
    {
      unlocksAtLevel: 5,
      options: [
        opt("destroyer_5_row_strike", "Row Strike", sid("row_strike")),
        opt("destroyer_5_drain_strike", "Drain Strike", sid("drain_strike")),
      ],
    },
    {
      unlocksAtLevel: 10,
      options: [
        opt("destroyer_10_pierce", "Pierce", sid("pierce")),
        opt("destroyer_10_poison_strike", "Poison Strike", sid("poison_strike")),
      ],
    },
    {
      unlocksAtLevel: 15,
      options: [
        opt("destroyer_15_armor_pierce", "Armor Pierce", sid("armor_pierce")),
        opt("destroyer_15_provoke_strike", "Provoke", sid("provoke_strike")),
      ],
    },
    {
      unlocksAtLevel: 20,
      options: [
        opt("destroyer_20_life_sweep", "Life Sweep", sid("life_sweep")),
        opt("destroyer_20_drain_strike", "Drain Strike", sid("drain_strike")),
      ],
    },
  ],
} satisfies Record<PlayerUnitTemplateId, UnitUpgradeTier[]>;
