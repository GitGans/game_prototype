import { UnitBlueprint, Skill, UnitUpgradeOption, UnitProgressionStatModifiers, SpriteSheetConfig } from '../battle/types';

export type UnitUpgradeChoices = Partial<Record<5 | 10 | 15 | 20, string>>;

export interface ResolvedUnitProgression {
  chosenUpgrades: UnitUpgradeOption[];
  skills: Skill[];
  statModifiers: UnitProgressionStatModifiers;
  spriteSheet: SpriteSheetConfig | undefined;
}

export function resolveChosenUnitUpgrades(
  blueprint: UnitBlueprint,
  chosenUpgrades: UnitUpgradeChoices,
): UnitUpgradeOption[] {
  const result: UnitUpgradeOption[] = [];
  const sortedTiers = [...(blueprint.upgradeTiers ?? [])].sort(
    (a, b) => a.unlocksAtLevel - b.unlocksAtLevel,
  );
  for (const tier of sortedTiers) {
    const chosenId = chosenUpgrades[tier.unlocksAtLevel];
    if (!chosenId) continue;
    const option = tier.options.find(o => o.id === chosenId);
    if (option) result.push(option);
  }
  return result;
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

function resolveSkillsFromUpgrades(
  blueprint: UnitBlueprint,
  upgrades: UnitUpgradeOption[],
): Skill[] {
  const skills: Skill[] = [];
  if (blueprint.baseSkill) skills.push(blueprint.baseSkill);
  for (const option of upgrades) {
    if (option.skill) skills.push(option.skill);
  }
  return skills;
}

function resolveSpriteSheetFromUpgrades(
  blueprint: UnitBlueprint,
  upgrades: UnitUpgradeOption[],
): SpriteSheetConfig | undefined {
  let result: SpriteSheetConfig | undefined;
  for (const option of upgrades) {
    if (option.spriteSheet) result = option.spriteSheet; // highest tier wins (upgrades sorted ascending)
  }
  return result ?? blueprint.spriteSheet;
}

export function resolveUnitProgression(
  blueprint: UnitBlueprint,
  chosenUpgradeIds: UnitUpgradeChoices,
): ResolvedUnitProgression {
  const chosenUpgrades = resolveChosenUnitUpgrades(blueprint, chosenUpgradeIds);
  return {
    chosenUpgrades,
    skills:        resolveSkillsFromUpgrades(blueprint, chosenUpgrades),
    statModifiers: computeUnitUpgradeStatModifiers(chosenUpgrades),
    spriteSheet:   resolveSpriteSheetFromUpgrades(blueprint, chosenUpgrades),
  };
}

