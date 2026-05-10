import type {
  UnitUpgradeOption,
  UnitProgressionStatModifiers,
  UnitClassId,
  UnitClassDefinition,
  UpgradeOptionId,
} from '../shared/unitTypes';
import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';

export type UnitUpgradeChoices = Partial<Record<5 | 10 | 15 | 20, UpgradeOptionId>>;

export interface ResolvedUnitProgression {
  chosenUpgrades: UnitUpgradeOption[];
  skills: ActionSkillDefinition[];
  statModifiers: UnitProgressionStatModifiers;
  spriteFilename: string | undefined;
  currentClassId: UnitClassId;
  currentClass: UnitClassDefinition;
}
