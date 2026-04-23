import { UnitBlueprint, Skill, UnitUpgradeOption, UnitProgressionStatModifiers } from '../battle/types';

export type UnitUpgradeChoices = Partial<Record<5 | 10 | 15 | 20, string>>;

export function resolveChosenUnitUpgrades(
  blueprint: UnitBlueprint,
  chosenUpgrades: UnitUpgradeChoices,
): UnitUpgradeOption[] {
  const result: UnitUpgradeOption[] = [];
  for (const tier of (blueprint.upgradeTiers ?? [])) {
    const chosenId = chosenUpgrades[tier.unlocksAtLevel];
    if (!chosenId) continue;
    const option = tier.options.find(o => o.id === chosenId);
    if (option) result.push(option);
  }
  return result;
}

export function resolveUnitSkills(
  blueprint: UnitBlueprint,
  chosenUpgrades: UnitUpgradeChoices,
): Skill[] {
  const skills: Skill[] = [];
  if (blueprint.baseSkill) skills.push(blueprint.baseSkill);
  for (const option of resolveChosenUnitUpgrades(blueprint, chosenUpgrades)) {
    if (option.skill) skills.push(option.skill);
  }
  return skills;
}

export function computeUnitUpgradeStatModifiers(
  upgrades: UnitUpgradeOption[],
): UnitProgressionStatModifiers {
  const result: UnitProgressionStatModifiers = {};
  for (const upgrade of upgrades) {
    const m = upgrade.statModifiers;
    if (!m) continue;
    result.hp              = (result.hp              ?? 0) + (m.hp              ?? 0);
    result.physicalDamage  = (result.physicalDamage  ?? 0) + (m.physicalDamage  ?? 0);
    result.magicalDamage   = (result.magicalDamage   ?? 0) + (m.magicalDamage   ?? 0);
    result.physicalDefense = (result.physicalDefense ?? 0) + (m.physicalDefense ?? 0);
    result.magicalDefense  = (result.magicalDefense  ?? 0) + (m.magicalDefense  ?? 0);
    result.dodge           = (result.dodge           ?? 0) + (m.dodge           ?? 0);
    result.block           = (result.block           ?? 0) + (m.block           ?? 0);
    result.initiative      = (result.initiative      ?? 0) + (m.initiative      ?? 0);
  }
  return result;
}
