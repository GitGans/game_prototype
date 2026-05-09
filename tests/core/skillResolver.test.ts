import { describe, it, expect } from "vitest";
import { SKILLS } from "../../src/data/skills";
import type { SkillId } from "../../src/shared/skillDefinitionTypes";
import { resolveSkillDefinition } from "../../src/progression/skillResolver";

const skillKeys = Object.keys(SKILLS) as Array<keyof typeof SKILLS>;
const firstSkillId = skillKeys[0] as SkillId;

describe("resolveSkillDefinition", () => {
  it("returns an ActionSkillDefinition for a known SkillId", () => {
    const skill = resolveSkillDefinition(firstSkillId);
    expect(Array.isArray(skill.actions)).toBe(true);
    expect(typeof skill.id).toBe("string");
  });

  it("throws for an unknown SkillId", () => {
    expect(() =>
      resolveSkillDefinition("__nonexistent__" as SkillId)
    ).toThrow(/Unknown SkillId/);
  });
});
