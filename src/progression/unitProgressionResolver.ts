import type {
  UnitBlueprint,
  UnitUpgradeOption,
  UnitProgressionStatModifiers,
} from '../shared/unitTypes';
import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';
import { resolveOptionalSkillDefinition } from './skillResolver';
import { resolveUnitClassDefinition } from './unitClassResolver';
import type { UnitUpgradeChoices, ResolvedUnitProgression } from './progressionTypes';

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
    result.hp               = (result.hp               ?? 0) + (m.hp               ?? 0);
    result.physicalStrength = (result.physicalStrength  ?? 0) + (m.physicalStrength  ?? 0);
    result.magicalStrength  = (result.magicalStrength   ?? 0) + (m.magicalStrength   ?? 0);
    result.physicalDefense  = (result.physicalDefense   ?? 0) + (m.physicalDefense   ?? 0);
    result.magicalDefense   = (result.magicalDefense    ?? 0) + (m.magicalDefense    ?? 0);
    result.dodge            = (result.dodge             ?? 0) + (m.dodge             ?? 0);
    result.block            = (result.block             ?? 0) + (m.block             ?? 0);
    result.initiative       = (result.initiative        ?? 0) + (m.initiative        ?? 0);
  }
  return result;
}

function resolveSkillsFromUpgrades(
  blueprint: UnitBlueprint,
  upgrades: UnitUpgradeOption[],
): ActionSkillDefinition[] {
  const skills: ActionSkillDefinition[] = [];
  const base = resolveOptionalSkillDefinition(blueprint.baseSkillId);
  if (base) skills.push(base);
  for (const option of upgrades) {
    const skill = resolveOptionalSkillDefinition(option.skillId);
    if (skill) skills.push(skill);
  }
  return skills;
}

function resolveSpriteFilenameFromUpgrades(
  blueprint: UnitBlueprint,
  upgrades:  UnitUpgradeOption[],
): string | undefined {
  let result: string | undefined;
  for (const option of upgrades) {
    if (option.spriteFilename) result = option.spriteFilename; // highest tier wins (upgrades sorted ascending)
  }
  return result ?? blueprint.spriteFilename;
}

export function resolveUnitProgression(
  blueprint: UnitBlueprint,
  chosenUpgradeIds: UnitUpgradeChoices,
): ResolvedUnitProgression {
  const chosenUpgrades = resolveChosenUnitUpgrades(blueprint, chosenUpgradeIds);

  // chosenUpgrades is sorted ascending by tier, so later entries overwrite earlier ones.
  // If multiple upgrades define classId, the highest tier wins.
  let currentClassId = blueprint.baseClassId;
  for (const upgrade of chosenUpgrades) {
    if (upgrade.classId) {
      currentClassId = upgrade.classId;
    }
  }

  return {
    chosenUpgrades,
    skills:        resolveSkillsFromUpgrades(blueprint, chosenUpgrades),
    statModifiers: computeUnitUpgradeStatModifiers(chosenUpgrades),
    spriteFilename: resolveSpriteFilenameFromUpgrades(blueprint, chosenUpgrades),
    currentClassId,
    currentClass:  resolveUnitClassDefinition(currentClassId),
  };
}
