import { describe, it, expect } from "vitest";
import { SKILLS } from "../../src/data/skillDefinitions";
import type { SkillId } from "../../src/shared/skillDefinitionTypes";
import { resolveSkillDefinition } from "../../src/core/skillResolver";

const skillKeys = Object.keys(SKILLS) as Array<keyof typeof SKILLS>;
const firstSkillId = skillKeys[0] as SkillId;

describe("resolveSkillDefinition", () => {
  it("returns an ActionSkillDefinition for a known SkillId", () => {
    const skill = resolveSkillDefinition(firstSkillId);
    expect(skill.definitionKind).toBe("action_skill");
    expect(typeof skill.id).toBe("string");
  });

  it("throws for an unknown SkillId", () => {
    expect(() =>
      resolveSkillDefinition("__nonexistent__" as SkillId)
    ).toThrow(/Unknown SkillId/);
  });
});
