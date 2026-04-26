import { Skill, UnitProgressionStatModifiers, UnitUpgradeOption } from '../battle/types';

export interface UnitUpgradeStatLineSnapshot {
  stat:  keyof UnitProgressionStatModifiers;
  label: string;
  value: number;
  text:  string;
  tone:  'positive' | 'negative';
}

const STAT_ORDER: ReadonlyArray<keyof UnitProgressionStatModifiers> = [
  'hp',
  'physicalDamage',
  'magicalDamage',
  'physicalDefense',
  'magicalDefense',
  'dodge',
  'block',
  'initiative',
];

const STAT_LABELS: Record<keyof UnitProgressionStatModifiers, string> = {
  hp:              'HP',
  physicalDamage:  'P.Dmg',
  magicalDamage:   'M.Dmg',
  physicalDefense: 'P.Def',
  magicalDefense:  'M.Def',
  dodge:           'Dodge',
  block:           'Block',
  initiative:      'Init',
};

// Moved from PhaseManager.ts — behavior unchanged.
// Used by toSkillIcon() for all skill snapshots, not only the upgrade tree.
export function buildSkillDescription(skill: Skill): string {
  if (skill.effectBlock)        return `${skill.actionType} · applies ${skill.effectBlock.effectDisplayName}`;
  if (skill.instantEffectBlock) return `${skill.actionType} · ${skill.instantEffectBlock.displayName}`;
  if (skill.damageBlock)        return `${skill.actionType} · ${skill.damageBlock.damageType} damage`;
  return skill.actionType;
}

// Priority: option.description → skill.description → ''
export function buildUnitUpgradeDescription(option: UnitUpgradeOption): string {
  const explicit = option.description?.trim();
  if (explicit) return explicit;
  if (option.skill) return buildSkillDescription(option.skill);
  return '';
}

// Stable order guaranteed by STAT_ORDER, not Object.entries().
export function buildUnitUpgradeStatLines(
  modifiers: UnitProgressionStatModifiers,
): UnitUpgradeStatLineSnapshot[] {
  return STAT_ORDER
    .filter(stat => modifiers[stat] !== undefined && modifiers[stat] !== 0)
    .map(stat => {
      const value = modifiers[stat]!;
      return {
        stat,
        label: STAT_LABELS[stat],
        value,
        text:  `${value > 0 ? '+' : ''}${value} ${STAT_LABELS[stat]}`,
        tone:  value > 0 ? 'positive' : 'negative',
      } as UnitUpgradeStatLineSnapshot;
    });
}
