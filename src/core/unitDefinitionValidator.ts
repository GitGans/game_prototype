import { PLAYER_UNITS, ENEMY_UNITS } from '../data/units';
import { SKILLS } from '../data/skillDefinitions';
import type { UnitBlueprint, UnitRace } from '../shared/unitTypes';
import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';

export function validateUnitDefinitionCollections(input: {
  playerUnits: UnitBlueprint[];
  enemyUnits: Record<UnitRace, UnitBlueprint[]>;
  skills: Record<string, ActionSkillDefinition>;
}): void {
  const { playerUnits, enemyUnits, skills } = input;

  // 1. Every skills key matches its embedded id field
  for (const [key, def] of Object.entries(skills)) {
    if (key !== def.id) {
      throw new Error(`SKILLS: key "${key}" does not match definition id "${def.id}"`);
    }
  }

  // 2. Player units — skill refs, upgrade option uniqueness, no enemy fields
  for (const bp of playerUnits) {
    if ('enemySkillUnlocks' in bp && bp.enemySkillUnlocks !== undefined) {
      throw new Error(`Player unit "${bp.templateId}" must not define enemySkillUnlocks`);
    }
    if (bp.baseSkillId !== undefined && !(bp.baseSkillId in skills)) {
      throw new Error(`Player unit "${bp.templateId}": baseSkillId "${bp.baseSkillId}" not in SKILLS`);
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
      }
    }
  }

  // 3. Enemy units — no player fields, deterministic one-skill-per-level model, skill refs valid
  for (const [race, units] of Object.entries(enemyUnits)) {
    for (const bp of units) {
      if (bp.baseSkillId !== undefined) {
        throw new Error(`Enemy unit "${bp.templateId}" (${race}) must not define baseSkillId`);
      }
      if ('upgradeTiers' in bp && bp.upgradeTiers !== undefined) {
        throw new Error(`Enemy unit "${bp.templateId}" (${race}) must not define upgradeTiers`);
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
}

export function validateUnitDefinitions(): void {
  validateUnitDefinitionCollections({
    playerUnits: PLAYER_UNITS,
    enemyUnits: ENEMY_UNITS,
    skills: SKILLS,
  });
}
