import type { UnitClassDefinition } from "../../shared/unitTypes";
import { ucid } from "../../shared/unitTypes";

export const UNIT_CLASS_DEFINITIONS = {
  knight: { id: ucid("knight"), name: "Knight" },
  warrior: { id: ucid("warrior"), name: "Warrior" },
  ranger: { id: ucid("ranger"), name: "Ranger" },
  mage: { id: ucid("mage"), name: "Mage" },
  priest: { id: ucid("priest"), name: "Priest" },
  pikeman: { id: ucid("pikeman"), name: "Pikeman" },
  halberdist: { id: ucid("halberdist"), name: "Halberdist" },
  crusher: { id: ucid("crusher"), name: "Crusher" },
  archer: { id: ucid("archer"), name: "Archer" },
  crossbowman: { id: ucid("crossbowman"), name: "Crossbowman" },
  stormbearer: { id: ucid("stormbearer"), name: "Stormbearer" },
  hieromonk: { id: ucid("hieromonk"), name: "Hieromonk" },
  warcryer: { id: ucid("warcryer"), name: "Warcryer" },
  therapist: { id: ucid("therapist"), name: "Therapist" },
  schemamonk: { id: ucid("schemamonk"), name: "Schemamonk" },
  tank: { id: ucid("tank"), name: "Tank" },
  soldier: { id: ucid("soldier"), name: "Soldier" },
  guard: { id: ucid("guard"), name: "Guard" },
  brawler: { id: ucid("brawler"), name: "Brawler" },
  marksman: { id: ucid("marksman"), name: "Marksman" },
  forest_ranger: { id: ucid("forest_ranger"), name: "Forest Ranger" },
  elementalist: { id: ucid("elementalist"), name: "Elementalist" },
  monk: { id: ucid("monk"), name: "Monk" },
  troublemaker: { id: ucid("troublemaker"), name: "Troublemaker" },
  healer: { id: ucid("healer"), name: "Healer" },
  shaman: { id: ucid("shaman"), name: "Shaman" },
  destroyer: { id: ucid("destroyer"), name: "Destroyer" },
} satisfies Record<string, UnitClassDefinition>;

export const UNIT_CLASS_IDS = new Set(Object.keys(UNIT_CLASS_DEFINITIONS));
