import { PLAYER_UNITS, ENEMY_UNITS } from '../data/units';
import { SKILLS } from '../data/skills';
import { UNIT_CLASS_DEFINITIONS } from '../data/units/unitClassDefinitions';
import { ITEM_DEFINITIONS } from '../data/itemDefinitions';
import type { UnitBlueprint, UnitRace } from '../shared/unitTypes';
import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';
import type { ItemDefinition } from '../shared/itemTypes';

export function validateUnitDefinitionCollections(input: {
  playerUnits: UnitBlueprint[];
  enemyUnits: Record<UnitRace, UnitBlueprint[]>;
  skills: Record<string, ActionSkillDefinition>;
  itemDefinitions: Record<string, ItemDefinition>;
}): void {
  const { playerUnits, enemyUnits, skills, itemDefinitions } = input;

  // 1. Every skills key matches its embedded id field
  for (const [key, def] of Object.entries(skills)) {
    if (key !== def.id) {
      throw new Error(`SKILLS: key "${key}" does not match definition id "${def.id}"`);
    }
  }

  // 2. Every UNIT_CLASS_DEFINITIONS key matches its embedded id
  for (const [key, def] of Object.entries(UNIT_CLASS_DEFINITIONS)) {
    if (String(def.id) !== key) {
      throw new Error(`UNIT_CLASS_DEFINITIONS: key "${key}" does not match definition id "${def.id}"`);
    }
  }

  // 3. Player units — skill refs, upgrade option uniqueness, no enemy fields, class ids
  for (const bp of playerUnits) {
    if ('enemySkillUnlocks' in bp && bp.enemySkillUnlocks !== undefined) {
      throw new Error(`Player unit "${bp.templateId}" must not define enemySkillUnlocks`);
    }
    if (bp.baseSkillId !== undefined && !(bp.baseSkillId in skills)) {
      throw new Error(`Player unit "${bp.templateId}": baseSkillId "${bp.baseSkillId}" not in SKILLS`);
    }
    if (!(String(bp.baseClassId) in UNIT_CLASS_DEFINITIONS)) {
      throw new Error(`Player unit "${bp.templateId}": baseClassId "${bp.baseClassId}" not in UNIT_CLASS_DEFINITIONS`);
    }
    const seenIds = new Set<string>();
    for (const tier of (bp.upgradeTiers ?? [])) {
      for (const option of tier.options) {
        if (seenIds.has(option.id)) {
          throw new Error(
            `Player unit "${bp.templateId}": duplicate upgrade option id "${option.id}"`,
          );
        }
        seenIds.add(option.id);
        if (option.skillId !== undefined && !(option.skillId in skills)) {
          throw new Error(
            `Player unit "${bp.templateId}", option "${option.id}": skillId "${option.skillId}" not in SKILLS`,
          );
        }
        if (option.classId !== undefined && !(String(option.classId) in UNIT_CLASS_DEFINITIONS)) {
          throw new Error(
            `Player unit "${bp.templateId}", option "${option.id}": classId "${option.classId}" not in UNIT_CLASS_DEFINITIONS`,
          );
        }
      }
    }
  }

  // 4. Enemy units — no player fields, deterministic one-skill-per-level model, skill refs + class ids valid
  for (const [race, units] of Object.entries(enemyUnits)) {
    for (const bp of units) {
      if (bp.baseSkillId !== undefined) {
        throw new Error(`Enemy unit "${bp.templateId}" (${race}) must not define baseSkillId`);
      }
      if ('upgradeTiers' in bp && bp.upgradeTiers !== undefined) {
        throw new Error(`Enemy unit "${bp.templateId}" (${race}) must not define upgradeTiers`);
      }
      if (!(String(bp.baseClassId) in UNIT_CLASS_DEFINITIONS)) {
        throw new Error(`Enemy unit "${bp.templateId}" (${race}): baseClassId "${bp.baseClassId}" not in UNIT_CLASS_DEFINITIONS`);
      }
      const seenLevels = new Set<number>();
      for (const unlock of (bp.enemySkillUnlocks ?? [])) {
        if (seenLevels.has(unlock.unlocksAtLevel)) {
          throw new Error(
            `Enemy unit "${bp.templateId}" (${race}): duplicate unlocksAtLevel ${unlock.unlocksAtLevel} in enemySkillUnlocks`,
          );
        }
        seenLevels.add(unlock.unlocksAtLevel);
        if (!(unlock.skillId in skills)) {
          throw new Error(
            `Enemy unit "${bp.templateId}" (${race}): enemySkillUnlock skillId "${unlock.skillId}" not in SKILLS`,
          );
        }
      }
    }
  }

  // 5. Item class restriction ids
  for (const [id, def] of Object.entries(itemDefinitions)) {
    for (const classId of (def.allowedClassIds ?? [])) {
      if (!(String(classId) in UNIT_CLASS_DEFINITIONS)) {
        throw new Error(`Item "${id}": allowedClassIds contains "${classId}" which is not in UNIT_CLASS_DEFINITIONS`);
      }
    }
  }
}

export function validateUnitDefinitions(): void {
  validateUnitDefinitionCollections({
    playerUnits: PLAYER_UNITS,
    enemyUnits: ENEMY_UNITS,
    skills: SKILLS,
    itemDefinitions: ITEM_DEFINITIONS,
  });
}
