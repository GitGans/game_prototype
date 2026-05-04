import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';
import type { SkillUsePlan } from './skillUsePlan';
import { compileActionSkillDefinition } from './actionSkillDefinitionCompiler';

export function compileSkillUsePlan(skill: ActionSkillDefinition): SkillUsePlan {
  return compileActionSkillDefinition(skill);
}
