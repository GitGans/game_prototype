import type { UnitBlueprint, UnitBattleStats, SpriteSheetConfig, UnitClassId, UnitLifeState } from '../shared/unitTypes';
import type { ActionSkillDefinition }  from '../shared/skillDefinitionTypes';
import type { Side }                   from '../shared/gridTypes';
import type { Unit }                   from './types';

export interface CreateUnitInstanceInput {
  blueprint:            UnitBlueprint;
  id:                   string;
  side:                 Side;
  level:                number;
  classId:              UnitClassId;
  stats:                UnitBattleStats;        // runtime combat stats (incl. equipment)
  statHighlightBaseStats: UnitBattleStats;      // stats WITHOUT equipment, for color baseline only
  skills:               ActionSkillDefinition[];
  spriteSheet:          SpriteSheetConfig | undefined;
  initialHp?:           number;
  initialLifeState?:    UnitLifeState;          // defaults to 'alive'
}

export function createUnitInstance(input: CreateUnitInstanceInput): Unit {
  const {
    blueprint: bp, id, side, level, classId, stats,
    statHighlightBaseStats, skills, spriteSheet, initialHp, initialLifeState,
  } = input;
  const maxHp     = stats.hp;
  const lifeState = initialLifeState ?? 'alive';
  // Canonical dead state is hp 0; initialHp is not consulted for dead units.
  const hp = lifeState === 'dead'
    ? 0
    : Math.max(1, Math.min(maxHp, initialHp ?? maxHp));
  return {
    id,
    name:                bp.name,
    hp,
    maxHp,
    lifeState,
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
    statHighlightBaseStats,
  };
}
