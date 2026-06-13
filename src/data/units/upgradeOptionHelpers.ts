import type { SkillId } from "../../shared/skillDefinitionTypes";
import type { UnitUpgradeOption, UpgradeOptionId } from "../../shared/unitTypes";

function uid(id: string): UpgradeOptionId {
  return id as UpgradeOptionId;
}

// Creates an upgrade option with an explicit name and validated skill reference.
// id must be unique within the unit. Convention: "{templateId}_{tierId}_{skillKey}".
// overrides may include: statModifiers, unitSpriteFilename, classId.
// classId: if set, choosing this option makes that class the unit's current class.
export function opt(
  id: string,
  name: string,
  skillId: SkillId,
  overrides: Partial<UnitUpgradeOption> = {},
): UnitUpgradeOption {
  return { ...overrides, id: uid(id), name, skillId };
}
