import type { UnitBlueprint, UnitBattleStats, SpriteSheetConfig, UnitClassId } from '../shared/unitTypes';
import type { ActionSkillDefinition }  from '../shared/skillDefinitionTypes';
import type { UnitActivatableAbility } from '../shared/itemTypes';
import type { CellCoord }              from '../shared/gridTypes';
import type { Unit }                   from './types';

export interface CreateUnitInstanceInput {
  blueprint:            UnitBlueprint;
  id:                   string;
  anchor:               CellCoord;
  level:                number;
  classId:              UnitClassId;
  stats:                UnitBattleStats;
  skills:               ActionSkillDefinition[];
  spriteSheet:          SpriteSheetConfig | undefined;
  activatableAbilities: UnitActivatableAbility[];
}

export function createUnitInstance(input: CreateUnitInstanceInput): Unit {
  const { blueprint: bp, id, anchor, level, classId, stats, skills, spriteSheet, activatableAbilities } = input;
  return {
    id,
    name:                bp.name,
    hp:                  stats.hp,
    maxHp:               stats.hp,
    physicalStrength:    stats.physicalStrength,
    magicalStrength:     stats.magicalStrength,
    physicalDefense:     stats.physicalDefense,
    magicalDefense:      stats.magicalDefense,
    dodge:               stats.dodge,
    block:               stats.block,
    level,
    classId,
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
