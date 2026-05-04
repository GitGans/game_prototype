import type { Effect } from '../shared/skillTypes';
import { LEVELED_EFFECTS } from '../data/skillDefinitions';

export function resolveLeveledStatEffect(
  effectName: string,
  level: number,
): Effect {
  const def = LEVELED_EFFECTS[effectName];
  if (!def) {
    throw new Error(`Unknown leveled effect: ${effectName}`);
  }
  if (def.effectKind !== 'stat_modifier') {
    throw new Error(`Effect "${effectName}" is not a stat modifier effect.`);
  }
  if (!def.bonusByLevel) {
    return def.effect;
  }
  const bonus = def.bonusByLevel[level - 1] ?? def.bonusByLevel[0];
  const base = def.effect;
  const resolved: Effect = { ...base };
  const bonusFields = [
    'physicalDefenseBonus',
    'magicalDefenseBonus',
    'dodgeBonus',
    'blockBonus',
    'initiativeBonus',
    'physicalDamageBonus',
    'magicalDamageBonus',
  ] as const;
  for (const field of bonusFields) {
    if (base[field] !== undefined) {
      (resolved as unknown as Record<string, number>)[field] =
        Math.sign(base[field]!) * bonus;
    }
  }
  return resolved;
}
