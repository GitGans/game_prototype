import type { UnitBlueprint, UnitBattleStats, SpriteSheetConfig } from '../shared/unitTypes';
import type { ActionSkillDefinition }  from '../shared/skillDefinitionTypes';
import type { UnitActivatableAbility } from '../shared/itemTypes';
import type { CellCoord }              from '../shared/gridTypes';
import type { Unit }                   from './types';

export interface CreateUnitInstanceInput {
  blueprint:            UnitBlueprint;
  id:                   string;
  anchor:               CellCoord;
  level:                number;
  stats:                UnitBattleStats;
  skills:               ActionSkillDefinition[];
  spriteSheet:          SpriteSheetConfig | undefined;
  activatableAbilities: UnitActivatableAbility[];
}

export function createUnitInstance(input: CreateUnitInstanceInput): Unit {
  const { blueprint: bp, id, anchor, level, stats, skills, spriteSheet, activatableAbilities } = input;
  return {
    id,
    name:                bp.name,
    hp:                  stats.hp,
    maxHp:               stats.hp,
    physicalDamage:      stats.physicalDamage,
    magicalDamage:       stats.magicalDamage,
    physicalDefense:     stats.physicalDefense,
    magicalDefense:      stats.magicalDefense,
    dodge:               stats.dodge,
    block:               stats.block,
    level,
    initiative:          stats.initiative,
    shape:               bp.shape,
    anchor,
    skills,
    activeSkillIndex:    0,
    rowTrait:            bp.rowTrait,
    race:                bp.race,
    templateId:          bp.templateId,
    spriteSheet,
    activeEffects:       [],
    activatableAbilities,
  };
}
