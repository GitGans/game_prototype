import type { UnitBlueprint } from "../../shared/unitTypes";
import { SHAPES } from "../shapeDefinitions";
import { sid } from "../skillDefinitions";
import { opt } from "./upgradeOptionHelpers";

export const PLAYER_UNITS: UnitBlueprint[] = [
  {
    templateId: "soldier",
    name: "Soldier",
    unitClass: "soldier",
    hp: 120,
    physicalStrength: 20,
    magicalStrength: 15,
    physicalDefense: 10,
    magicalDefense: -5,
    dodge: 0,
    block: 0,
    level: 1,
    initiative: 9,
    shape: SHAPES["1x1"],
    baseSkillId: sid("p_melee_basic"),
    upgradeTiers: [
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
          opt(
            "soldier_10_poison_strike",
            "Poison Strike",
            sid("poison_strike"),
          ),
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
    rowTrait: "front",
    spriteSheet: {
      path: "assets/sprites/units/soldier.png",
      frameWidth: 128,
      frameHeight: 128,
      states: ["idle", "attack", "death"],
    },
  },
  {
    templateId: "warrior",
    name: "Warrior",
    unitClass: "warrior",
    hp: 130,
    physicalStrength: 25,
    magicalStrength: 10,
    physicalDefense: 15,
    magicalDefense: -10,
    dodge: 0,
    block: 0,
    level: 1,
    initiative: 8,
    shape: SHAPES["1x1"],
    baseSkillId: sid("p_melee_basic"),
    upgradeTiers: [
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
          opt(
            "warrior_10_poison_strike",
            "Poison Strike",
            sid("poison_strike"),
          ),
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
    rowTrait: "front",
    spriteSheet: {
      path: "assets/sprites/units/warrior.png",
      frameWidth: 128,
      frameHeight: 128,
      states: ["idle", "attack", "death"],
    },
  },
  {
    templateId: "guard",
    name: "Guard",
    unitClass: "guard",
    hp: 110,
    physicalStrength: 25,
    magicalStrength: 15,
    physicalDefense: 5,
    magicalDefense: -5,
    dodge: 0,
    block: 0,
    level: 1,
    initiative: 10,
    shape: SHAPES["1x1"],
    baseSkillId: sid("p_melee_basic"),
    upgradeTiers: [
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
    rowTrait: "front",
    spriteSheet: {
      path: "assets/sprites/units/guard.png",
      frameWidth: 128,
      frameHeight: 128,
      states: ["idle", "attack", "death"],
    },
  },
  {
    templateId: "brawler",
    name: "Brawler",
    unitClass: "brawler",
    hp: 90,
    physicalStrength: 20,
    magicalStrength: 20,
    physicalDefense: 0,
    magicalDefense: 0,
    dodge: 0,
    block: 0,
    level: 1,
    initiative: 12,
    shape: SHAPES["1x1"],
    baseSkillId: sid("p_melee_basic"),
    upgradeTiers: [
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
    rowTrait: "front",
    spriteSheet: {
      path: "assets/sprites/units/brawler.png",
      frameWidth: 128,
      frameHeight: 128,
      states: ["idle", "attack", "death"],
    },
  },
  {
    templateId: "marksman",
    name: "Marksman",
    unitClass: "marksman",
    hp: 110,
    physicalStrength: 25,
    magicalStrength: 15,
    physicalDefense: 5,
    magicalDefense: -5,
    dodge: 0,
    block: 0,
    level: 1,
    initiative: 10,
    shape: SHAPES["1x1"],
    baseSkillId: sid("p_ranged_basic"),
    upgradeTiers: [
      {
        unlocksAtLevel: 5,
        options: [
          opt(
            "marksman_5_p_ranged_slowing",
            "Arrow that breaks legs",
            sid("p_ranged_slowing"),
          ),
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
          opt(
            "marksman_15_poison_strike",
            "Poison Strike",
            sid("poison_strike"),
          ),
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
    rowTrait: "front",
    spriteSheet: {
      path: "assets/sprites/units/marksman.png",
      frameWidth: 128,
      frameHeight: 128,
      states: ["idle", "attack", "death"],
    },
  },
  {
    templateId: "forest_ranger",
    name: "Forest Ranger",
    unitClass: "forest_ranger",
    hp: 90,
    physicalStrength: 20,
    magicalStrength: 20,
    physicalDefense: 0,
    magicalDefense: 0,
    dodge: 0,
    block: 0,
    level: 1,
    initiative: 12,
    shape: SHAPES["1x1"],
    baseSkillId: sid("p_ranged_basic"),
    upgradeTiers: [
      {
        unlocksAtLevel: 5,
        options: [
          opt(
            "forest_ranger_5_distract_shot",
            "Distract",
            sid("distract_shot"),
          ),
          opt(
            "forest_ranger_5_p_ranged_slowing",
            "Arrow that breaks legs",
            sid("p_ranged_slowing"),
          ),
        ],
      },
      {
        unlocksAtLevel: 10,
        options: [
          opt(
            "forest_ranger_10_poison_strike",
            "Poison Strike",
            sid("poison_strike"),
          ),
          opt("forest_ranger_10_pierce", "Pierce", sid("pierce")),
        ],
      },
      {
        unlocksAtLevel: 15,
        options: [
          opt(
            "forest_ranger_15_armor_pierce",
            "Armor Pierce",
            sid("armor_pierce"),
          ),
          opt(
            "forest_ranger_15_drain_strike",
            "Drain Strike",
            sid("drain_strike"),
          ),
        ],
      },
      {
        unlocksAtLevel: 20,
        options: [
          opt("forest_ranger_20_life_sweep", "Life Sweep", sid("life_sweep")),
          opt(
            "forest_ranger_20_drain_strike",
            "Drain Strike",
            sid("drain_strike"),
          ),
        ],
      },
    ],
    rowTrait: "front",
    spriteSheet: {
      path: "assets/sprites/units/forest_ranger.png",
      frameWidth: 128,
      frameHeight: 128,
      states: ["idle", "attack", "death"],
    },
  },
  {
    templateId: "elementalist",
    name: "Elementalist",
    unitClass: "elementalist",
    hp: 80,
    physicalStrength: 10,
    magicalStrength: 30,
    physicalDefense: 0,
    magicalDefense: 10,
    dodge: 0,
    block: 0,
    level: 1,
    initiative: 11,
    shape: SHAPES["1x1"],
    baseSkillId: sid("m_ranged_basic"),
    upgradeTiers: [
      {
        unlocksAtLevel: 5,
        options: [
          opt(
            "elementalist_5_arcane_cross",
            "Arcane Cross",
            sid("arcane_cross"),
          ),
          opt(
            "elementalist_5_weaken_curse",
            "Weaken Curse",
            sid("weaken_curse"),
          ),
        ],
      },
      {
        unlocksAtLevel: 10,
        options: [
          opt(
            "elementalist_10_arcane_cross",
            "Arcane Cross",
            sid("arcane_cross"),
          ),
          opt(
            "elementalist_10_m_ranged_basic",
            "Magic Shot",
            sid("m_ranged_basic"),
          ),
        ],
      },
      {
        unlocksAtLevel: 15,
        options: [
          opt(
            "elementalist_15_weaken_curse",
            "Weaken Curse",
            sid("weaken_curse"),
          ),
          opt(
            "elementalist_15_arcane_cross",
            "Arcane Cross",
            sid("arcane_cross"),
          ),
        ],
      },
      {
        unlocksAtLevel: 20,
        options: [
          opt(
            "elementalist_20_arcane_cross",
            "Arcane Cross",
            sid("arcane_cross"),
          ),
          opt(
            "elementalist_20_weaken_curse",
            "Weaken Curse",
            sid("weaken_curse"),
          ),
        ],
      },
    ],
    rowTrait: "back",
    spriteSheet: {
      path: "assets/sprites/units/elementalist.png",
      frameWidth: 128,
      frameHeight: 128,
      states: ["idle", "attack", "death"],
    },
  },
  {
    templateId: "monk",
    name: "Monk",
    unitClass: "monk",
    hp: 110,
    physicalStrength: 25,
    magicalStrength: 15,
    physicalDefense: 10,
    magicalDefense: -5,
    dodge: 0,
    block: 0,
    level: 1,
    initiative: 9,
    shape: SHAPES["1x1"],
    baseSkillId: sid("m_ranged_basic"),
    upgradeTiers: [
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
    rowTrait: "back",
    spriteSheet: {
      path: "assets/sprites/units/monk.png",
      frameWidth: 128,
      frameHeight: 128,
      states: ["idle", "attack", "death"],
    },
  },
  {
    templateId: "troublemaker",
    name: "Troublemaker",
    unitClass: "troublemaker",
    hp: 80,
    physicalStrength: 10,
    magicalStrength: 30,
    physicalDefense: 0,
    magicalDefense: 10,
    dodge: 0,
    block: 0,
    level: 1,
    initiative: 11,
    shape: SHAPES["1x1"],
    baseSkillId: sid("m_ranged_basic"),
    upgradeTiers: [
      {
        unlocksAtLevel: 5,
        options: [
          opt(
            "troublemaker_5_arcane_cross",
            "Arcane Cross",
            sid("arcane_cross"),
          ),
          opt(
            "troublemaker_5_weaken_curse",
            "Weaken Curse",
            sid("weaken_curse"),
          ),
        ],
      },
      {
        unlocksAtLevel: 10,
        options: [
          opt(
            "troublemaker_10_weaken_curse",
            "Weaken Curse",
            sid("weaken_curse"),
          ),
          opt(
            "troublemaker_10_arcane_cross",
            "Arcane Cross",
            sid("arcane_cross"),
          ),
        ],
      },
      {
        unlocksAtLevel: 15,
        options: [
          opt(
            "troublemaker_15_arcane_cross",
            "Arcane Cross",
            sid("arcane_cross"),
          ),
          opt(
            "troublemaker_15_m_ranged_basic",
            "Magic Shot",
            sid("m_ranged_basic"),
          ),
        ],
      },
      {
        unlocksAtLevel: 20,
        options: [
          opt(
            "troublemaker_20_weaken_curse",
            "Weaken Curse",
            sid("weaken_curse"),
          ),
          opt(
            "troublemaker_20_arcane_cross",
            "Arcane Cross",
            sid("arcane_cross"),
          ),
        ],
      },
    ],
    rowTrait: "back",
    spriteSheet: {
      path: "assets/sprites/units/troublemaker.png",
      frameWidth: 128,
      frameHeight: 128,
      states: ["idle", "attack", "death"],
    },
  },
  {
    templateId: "healer",
    name: "Healer",
    unitClass: "healer",
    hp: 90,
    physicalStrength: 15,
    magicalStrength: 25,
    physicalDefense: 10,
    magicalDefense: 5,
    dodge: 0,
    block: 0,
    level: 1,
    initiative: 9,
    shape: SHAPES["1x1"],
    baseSkillId: sid("m_heal_basic"),
    upgradeTiers: [
      {
        unlocksAtLevel: 5,
        options: [
          opt(
            "healer_5_heal_with_defence",
            "Protective Heal",
            sid("heal_with_defence"),
          ),
          opt(
            "healer_5_self_heal_mass_regeneration",
            "Regenerative Heal",
            sid("self_heal_mass_regeneration"),
          ),
        ],
      },
      {
        unlocksAtLevel: 10,
        options: [
          opt(
            "healer_10_self_heal_mass_regeneration",
            "Regenerative Heal",
            sid("self_heal_mass_regeneration"),
          ),
          opt(
            "healer_10_heal_with_defence",
            "Protective Heal",
            sid("heal_with_defence"),
          ),
        ],
      },
      {
        unlocksAtLevel: 15,
        options: [
          opt(
            "healer_15_heal_with_defence",
            "Protective Heal",
            sid("heal_with_defence"),
          ),
          opt("healer_15_m_heal_basic", "Heal", sid("m_heal_basic")),
        ],
      },
      {
        unlocksAtLevel: 20,
        options: [
          opt(
            "healer_20_self_heal_mass_regeneration",
            "Regenerative Heal",
            sid("self_heal_mass_regeneration"),
          ),
          opt(
            "healer_20_heal_with_defence",
            "Protective Heal",
            sid("heal_with_defence"),
          ),
        ],
      },
    ],
    rowTrait: "back",
    spriteSheet: {
      path: "assets/sprites/units/healer.png",
      frameWidth: 128,
      frameHeight: 128,
      states: ["idle", "attack", "death"],
    },
  },
  {
    templateId: "shaman",
    name: "Shaman",
    unitClass: "shaman",
    hp: 100,
    physicalStrength: 20,
    magicalStrength: 20,
    physicalDefense: 5,
    magicalDefense: 0,
    dodge: 0,
    block: 0,
    level: 1,
    initiative: 10,
    shape: SHAPES["1x1"],
    baseSkillId: sid("m_ranged_basic"),
    upgradeTiers: [
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
    rowTrait: "back",
    spriteSheet: {
      path: "assets/sprites/units/shaman.png",
      frameWidth: 128,
      frameHeight: 128,
      states: ["idle", "attack", "death"],
    },
  },
  {
    templateId: "destroyer",
    name: "Destroyer",
    unitClass: "destroyer",
    hp: 120,
    physicalStrength: 20,
    magicalStrength: 15,
    physicalDefense: 10,
    magicalDefense: -5,
    dodge: 0,
    block: 0,
    level: 1,
    initiative: 9,
    shape: SHAPES["1x1"],
    baseSkillId: sid("p_melee_basic"),
    upgradeTiers: [
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
          opt(
            "destroyer_10_poison_strike",
            "Poison Strike",
            sid("poison_strike"),
          ),
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
    rowTrait: "front",
    spriteSheet: {
      path: "assets/sprites/units/destroyer.png",
      frameWidth: 128,
      frameHeight: 128,
      states: ["idle", "attack", "death"],
    },
  },
];

// These 5 start on the field; the remaining 3 go to the bench
export const PLAYER_STARTING_IDS = [
  "pikeman",
  "warrior",
  "halberdist",
  "crusher",
  "archer",
  "crossbowman",
  "stormbearer",
  "hieromonk",
  "warcryer",
  "therapist",
  "schemamonk",
  "tank",
];
