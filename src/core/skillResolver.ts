import { SKILLS } from '../data/skillDefinitions';
import type { ActionSkillDefinition, SkillId } from '../shared/skillDefinitionTypes';

export function resolveSkillDefinition(skillId: SkillId): ActionSkillDefinition {
  const skill = SKILLS[skillId as string as keyof typeof SKILLS];
  if (!skill) throw new Error(`Unknown SkillId: "${skillId}"`);
  return skill;
}

export function resolveOptionalSkillDefinition(
  skillId: SkillId | undefined,
): ActionSkillDefinition | undefined {
  if (skillId === undefined) return undefined;
  return resolveSkillDefinition(skillId);
}
