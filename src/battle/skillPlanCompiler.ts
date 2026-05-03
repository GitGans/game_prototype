import type { Skill } from '../shared/skillTypes';
import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';
import type { SkillUsePlan } from './skillUsePlan';
import { compileLegacySkill } from './legacySkillCompiler';
import { compileActionSkillDefinition } from './actionSkillDefinitionCompiler';

export type SkillPlanSource = Skill | ActionSkillDefinition;

function isActionSkillDefinition(
  source: SkillPlanSource,
): source is ActionSkillDefinition {
  return 'definitionKind' in source && source.definitionKind === 'action_skill';
}

export function compileSkillUsePlan(source: SkillPlanSource): SkillUsePlan {
  if (isActionSkillDefinition(source)) {
    return compileActionSkillDefinition(source);
  }
  return compileLegacySkill(source);
}
