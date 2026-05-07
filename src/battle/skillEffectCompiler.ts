import type { Effect, SkillLevel } from '../shared/skillTypes';
import { STAT_EFFECTS } from '../data/skills';
import { requireSkillLevel } from './skillLevels';

export function resolveStatEffect(
  effectName: string,
  level: SkillLevel,
): Effect {
  const def = STAT_EFFECTS[effectName];
  if (!def) {
    throw new Error(`Unknown stat effect: ${effectName}`);
  }
  const bonus = requireSkillLevel(
    def.bonusByLevel,
    level,
    `stat effect "${effectName}"`,
  );
  const signedBonus = def.direction === 'buff' ? bonus : -bonus;
  return {
    id: effectName,
    effectTone: def.direction === 'buff' ? 'positive' : 'negative',
    description: def.description,
    [def.bonusField]: signedBonus,
  };
}
