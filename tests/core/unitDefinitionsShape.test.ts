import { describe, it, expect } from "vitest";
import { PLAYER_UNITS, ENEMY_UNITS } from "../../src/data/unitDefinitions";

describe("unitDefinitions shape", () => {
  it("player blueprints store skill IDs not embedded skill objects", () => {
    for (const bp of PLAYER_UNITS) {
      expect(bp).not.toHaveProperty("baseSkill");
      expect(bp).not.toHaveProperty("skillTiers");
      if (bp.baseSkillId !== undefined) {
        expect(typeof bp.baseSkillId).toBe("string");
      }
      for (const tier of bp.upgradeTiers ?? []) {
        for (const option of tier.options) {
          expect(option).not.toHaveProperty("skill");
          expect(typeof option.id).toBe("string");
          if (option.skillId !== undefined) {
            expect(typeof option.skillId).toBe("string");
          }
        }
      }
    }
  });

  it("enemy blueprints store skill IDs not embedded skill objects", () => {
    for (const units of Object.values(ENEMY_UNITS)) {
      for (const bp of units) {
        expect(bp).not.toHaveProperty("levelSkills");
        for (const unlock of bp.enemySkillUnlocks ?? []) {
          expect(unlock).not.toHaveProperty("skill");
          expect(typeof unlock.skillId).toBe("string");
        }
      }
    }
  });
});
