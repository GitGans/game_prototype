import type { UnitShape } from './gridTypes';
import type { ActionSkillDefinition } from './skillDefinitionTypes';

export type SpriteState = 'idle' | 'attack' | 'death';

export interface SpriteSheetConfig {
  path: string;
  frameWidth: number;
  frameHeight: number;
  states: SpriteState[];
}

export type RowTrait = 'front' | 'back';
export type UnitRace = 'orc' | 'demon' | 'undead';
export type UnitClass =
  | 'warrior' | 'ranger' | 'mage' | 'priest'
  | 'pikeman' | 'halberdist' | 'crusher'
  | 'archer' | 'crossbowman' | 'stormbearer'
  | 'hieromonk' | 'warcryer' | 'therapist' | 'schemamonk'
  | 'tank'
  | 'soldier' | 'guard' | 'brawler' | 'marksman' | 'forest_ranger'
  | 'elementalist' | 'monk' | 'troublemaker' | 'healer' | 'shaman' | 'destroyer';

export interface UnitProgressionStatModifiers {
  hp?: number;
  physicalStrength?: number;
  magicalStrength?: number;
  physicalDefense?: number;
  magicalDefense?: number;
  dodge?: number;
  block?: number;
  initiative?: number;
}

export interface UnitBattleStats {
  hp: number;
  physicalStrength: number;
  magicalStrength: number;
  physicalDefense: number;
  magicalDefense: number;
  dodge: number;
  block: number;
  initiative: number;
}

export interface UnitUpgradeOption {
  id: string;
  name: string;
  description?: string;
  skill?: ActionSkillDefinition;
  statModifiers?: UnitProgressionStatModifiers;
  spriteSheet?: SpriteSheetConfig;
}

export interface UnitUpgradeTier {
  unlocksAtLevel: 5 | 10 | 15 | 20;
  options: UnitUpgradeOption[];
}

export interface SkillTier {
  unlocksAtLevel: 0 | 5 | 10 | 15 | 20;
  options: ActionSkillDefinition[];
}

export interface EnemyLevelSkill {
  unlocksAtLevel: 5 | 10 | 15 | 20;
  skill: ActionSkillDefinition;
}

export interface UnitBlueprint {
  templateId: string;
  name: string;
  hp: number;
  physicalStrength: number;
  magicalStrength: number;
  physicalDefense: number;  // percentage 0–100, reduces incoming physical damage
  magicalDefense: number;   // percentage 0–100, reduces incoming magical damage
  dodge: number;            // % chance to avoid damage entirely (effective cap: 90)
  block: number;            // % chance to take only 50% damage (effective cap: 90)
  level: number;
  initiative: number;
  shape: UnitShape;
  baseSkill?: ActionSkillDefinition;                // player units only; auto-learned at level 0
  upgradeTiers?: UnitUpgradeTier[];  // player units only; tiers 5/10/15/20
  skillTiers?: SkillTier[];         // enemy units only; tier 0 base skill
  levelSkills?: EnemyLevelSkill[];  // enemy-only; absent on player blueprints
  rowTrait: RowTrait;
  race?: UnitRace;
  unitClass: UnitClass;
  spriteSheet?: SpriteSheetConfig;
}
