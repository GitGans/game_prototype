import type { UnitBlueprint, UnitBattleStats, SpriteSheetConfig, UnitClassId } from '../shared/unitTypes';
import type { ActionSkillDefinition }  from '../shared/skillDefinitionTypes';
import type { UnitActivatableAbility } from '../shared/itemTypes';
import type { Side }                   from '../shared/gridTypes';
import type { Unit }                   from './types';

export interface CreateUnitInstanceInput {
  blueprint:            UnitBlueprint;
  id:                   string;
  side:                 Side;
  level:                number;
  classId:              UnitClassId;
  stats:                UnitBattleStats;
  skills:               ActionSkillDefinition[];
  spriteSheet:          SpriteSheetConfig | undefined;
  activatableAbilities: UnitActivatableAbility[];
  initialHp?:           number;
}

export function createUnitInstance(input: CreateUnitInstanceInput): Unit {
  const { blueprint: bp, id, side, level, classId, stats, skills, spriteSheet, activatableAbilities, initialHp } = input;
  const maxHp = stats.hp;
  const hp = Math.max(1, Math.min(maxHp, initialHp ?? maxHp));
  return {
    id,
    name:                bp.name,
    hp,
    maxHp,
    lifeState:           'alive',
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
    side,
    skills,
    activeSkillIndex:    0,
    rowTrait:            bp.rowTrait,
    templateId:          bp.templateId,
    spriteSheet,
    activeEffects:       [],
    activatableAbilities,
  };
}
