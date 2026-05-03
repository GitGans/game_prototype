import type { Skill } from '../shared/skillTypes';
import type { SkillUsePlan } from './skillUsePlan';
import { compileLegacySkill } from './legacySkillCompiler';

export function compileSkillUsePlan(skill: Skill): SkillUsePlan {
  return compileLegacySkill(skill);
}
