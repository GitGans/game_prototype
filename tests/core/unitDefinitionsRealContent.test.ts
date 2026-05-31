import { describe, it, expect } from "vitest";
import { validateUnitDefinitions } from "../../src/core/unitDefinitionValidator";

describe("real content reference integrity", () => {
  it("PLAYER_UNITS, ENEMY_UNITS, SKILLS, ITEM_DEFINITIONS pass validateUnitDefinitions", () => {
    expect(() => validateUnitDefinitions()).not.toThrow();
  });
});
