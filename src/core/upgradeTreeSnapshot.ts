import type { RosterState } from '../progression';
import type { UpgradeTierSnapshot, UpgradeOptionSnapshot } from './phases';
import { PLAYER_UNITS } from '../data/units';
import { resolveSkillDefinition, resolveUnitClassDefinition } from '../progression';
import { buildSkillIconSnapshot, buildUnitUpgradeStatLines } from './unitUpgradePresentation';
import { resolvePlayerUpgradeSpriteSheet } from './unitSprites';
import { getUnitSpriteTextureKey } from './unitSpriteKey';

export interface UpgradeTreePlayerSnapshot {
  unitName: string;
  upgradeTiers: UpgradeTierSnapshot[];
}

export function buildUpgradeTreePlayerSnapshot(
  roster: RosterState,
  templateId: string,
): UpgradeTreePlayerSnapshot {
  const blueprint = PLAYER_UNITS.find(u => u.templateId === templateId);
  const unitState = roster.units[templateId];

  if (!blueprint || !unitState) {
    return { unitName: '', upgradeTiers: [] };
  }

  const level = unitState.level;
  const chosenUpgrades = unitState.chosenUpgrades;

  const upgradeTiers: UpgradeTierSnapshot[] = (blueprint.upgradeTiers ?? []).map(tier => ({
    tierId: tier.unlocksAtLevel,
    options: tier.options.map((upg): UpgradeOptionSnapshot => {
      const skill = resolveSkillDefinition(upg.skillId);
      const classChangeName = upg.classId ? resolveUnitClassDefinition(upg.classId).name : null;
      const previewSheet = resolvePlayerUpgradeSpriteSheet(upg);
      return {
        id: upg.id,
        name: upg.name,
        skill: buildSkillIconSnapshot(skill),
        statLines: buildUnitUpgradeStatLines(upg.statModifiers ?? {}),
        unitPreviewTextureKey: previewSheet
          ? getUnitSpriteTextureKey(blueprint.templateId, previewSheet)
          : null,
        classChangeName,
      };
    }),
    chosenUpgradeId: chosenUpgrades[tier.unlocksAtLevel] ?? null,
    isLocked: level < tier.unlocksAtLevel,
  }));

  return { unitName: blueprint.name, upgradeTiers };
}
