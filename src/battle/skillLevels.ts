import type { SkillLevel, SkillLevelTable } from '../shared/skillTypes';

export function requireSkillLevel<T>(
  table: SkillLevelTable<T>,
  level: SkillLevel,
  label: string,
): T {
  // JS numeric keys are stored as strings internally; table[level] relies on automatic coercion.
  const value = table[level];
  if (value === undefined) {
    const available = Object.keys(table)
      .map(Number)
      .sort((a, b) => a - b)
      .join(', ');
    throw new Error(`${label}: missing level ${level}. Available levels: ${available}`);
  }
  return value;
}
