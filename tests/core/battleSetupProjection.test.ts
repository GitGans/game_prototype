import { describe, it, expect } from "vitest";
import { PLAYER_UNITS } from "../../src/data/units";
import { buildPlayerUnitInput } from "../../src/core/battleSetupProjection";
import type { PlayerBattleSetup } from "../../src/core/battleSetup";
import type { PlayerUnitState } from "../../src/core/GameState";
import type { CellCoord } from "../../src/shared/gridTypes";

function containsSkillObject(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray((value as Record<string, unknown>).actions)) return true;
  return Object.values(value as Record<string, unknown>).some(containsSkillObject);
}

// Find first player unit that has a baseSkillId and at least one skill-granting upgrade option
const bp = PLAYER_UNITS.find(
  u => u.baseSkillId && u.upgradeTiers?.some(t => t.options.some(o => o.skillId !== undefined))
)!;
const tier = bp.upgradeTiers!.find(t => t.options.some(o => o.skillId !== undefined))!;
const option = tier.options.find(o => o.skillId !== undefined)!;

const unitState: PlayerUnitState = {
  level: 1,
  isInCamp: false,
  lastPlacement: null,
  permanentBonuses: {},
  chosenUpgrades: { [tier.unlocksAtLevel]: option.id } as PlayerUnitState["chosenUpgrades"],
};

const setup: PlayerBattleSetup = {
  playerUnits: { [bp.templateId]: unitState },
  itemContainers: {},
  itemInstances: {},
};

const anchor: CellCoord = { side: "player", row: 0, col: 0 };

describe("buildPlayerUnitInput — campaign/battle boundary", () => {
  it("returns resolved ActionSkillDefinition[] for battle runtime", () => {
    const result = buildPlayerUnitInput(bp.templateId, anchor, "u1", setup);
    expect(result).not.toBeNull();
    expect(result!.skills.length).toBeGreaterThanOrEqual(1);
    expect(result!.skills.every(s => Array.isArray(s.actions))).toBe(true);
  });

  it("setup state retains string IDs — no ActionSkillDefinition leaked into campaign state", () => {
    buildPlayerUnitInput(bp.templateId, anchor, "u1", setup);
    const chosenValue = setup.playerUnits[bp.templateId].chosenUpgrades[tier.unlocksAtLevel];
    expect(typeof chosenValue).toBe("string");
    expect(containsSkillObject(setup.playerUnits)).toBe(false);
  });
});
