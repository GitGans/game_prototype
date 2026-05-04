import type { Effect, SkillLevel } from '../shared/skillTypes';
import { LEVELED_EFFECTS } from '../data/skillDefinitions';
import { requireSkillLevel } from './skillLevels';

export function resolveLeveledStatEffect(
  effectName: string,
  level: SkillLevel,
): Effect {
  const def = LEVELED_EFFECTS[effectName];
  if (!def) {
    throw new Error(`Unknown leveled effect: ${effectName}`);
  }
  if (def.effectKind !== 'stat_modifier') {
    throw new Error(`Effect "${effectName}" is not a stat modifier effect.`);
  }
  const bonus = requireSkillLevel(
    def.bonusByLevel,
    level,
    `stat modifier effect "${effectName}"`,
  );
  const base = def.effect;
  const resolved: Effect = { ...base };
  const bonusFields = [
    'physicalDefenseBonus',
    'magicalDefenseBonus',
    'dodgeBonus',
    'blockBonus',
    'initiativeBonus',
    'physicalStrengthBonus',
    'magicalStrengthBonus',
  ] as const;
  for (const field of bonusFields) {
    if (base[field] !== undefined) {
      (resolved as unknown as Record<string, number>)[field] =
        Math.sign(base[field]!) * bonus;
    }
  }
  return resolved;
}
