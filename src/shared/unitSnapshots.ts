import type { DamageType, SkillActionType } from '../battle/types';

export interface UnitStatValueSnapshot {
  base:  number;  // blueprint + level scaling only
  value: number;  // final: base + upgrade modifiers + equipment + permanent bonuses
}

export interface UnitStatsSnapshot {
  level:           number;
  hp:              UnitStatValueSnapshot;
  maxHp:           UnitStatValueSnapshot;
  physicalDamage:  UnitStatValueSnapshot;
  magicalDamage:   UnitStatValueSnapshot;
  physicalDefense: UnitStatValueSnapshot;
  magicalDefense:  UnitStatValueSnapshot;
  dodge:           UnitStatValueSnapshot;
  block:           UnitStatValueSnapshot;
  initiative:      UnitStatValueSnapshot;
}

export interface SkillIconSnapshot {
  id:          string;
  name:        string;
  description: string;
  damageType:  DamageType | null;
  actionType:  SkillActionType;
}
