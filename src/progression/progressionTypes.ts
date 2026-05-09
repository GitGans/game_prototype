import type {
  UnitUpgradeOption,
  UnitProgressionStatModifiers,
  SpriteSheetConfig,
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
  spriteSheet: SpriteSheetConfig | undefined;
  currentClassId: UnitClassId;
  currentClass: UnitClassDefinition;
}
