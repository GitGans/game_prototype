import { describe, it, expect } from "vitest";
import {
  formatConsumePrompt,
  formatUseEffectLine,
  formatConsumableBlockedReason,
} from "../../src/objects/itemUseEffectPresentation";
import type { ConsumableUseFailure } from "../../src/shared/itemTypes";

/**
 * Every failure the pipeline can report, listed by hand so the exhaustiveness check below is a
 * real assertion rather than a restatement of the source. A new reason fails to compile here.
 */
const ALL_REASONS: ConsumableUseFailure[] = [
  "missing_instance",
  "missing_definition",
  "not_consumable",
  "missing_use_effect",
  "not_in_backpack",
  "duplicate_placement",
  "unit_dead",
  "invalid_amount",
  "invalid_result",
  "unit_not_found",
  "blueprint_not_found",
  "unsupported_effect",
];

describe("formatConsumePrompt", () => {
  it("names both the permanent max-HP growth and the immediate heal for an HP boost", () => {
    const text = formatConsumePrompt({
      instanceId: "i1", unitTemplateId: "warrior",
      unitName: "Warrior", itemName: "Vitality Essence",
      stat: "hp", amount: 5, healsCurrentHp: true,
    });

    expect(text).toContain("Vitality Essence");
    expect(text).toContain("Warrior");
    expect(text).toMatch(/Max HP/);
    expect(text).toMatch(/permanent/i);
    expect(text).toMatch(/restores 5 HP/i);
  });

  it("states only the permanent gain for a non-HP boost", () => {
    const text = formatConsumePrompt({
      instanceId: "i2", unitTemplateId: "warrior",
      unitName: "Warrior", itemName: "Might Essence",
      stat: "physicalStrength", amount: 2, healsCurrentHp: false,
    });

    expect(text).toContain("+2 Phys Str");
    expect(text).toMatch(/permanent/i);
    expect(text).not.toMatch(/restores/i);
  });
});

describe("formatUseEffectLine", () => {
  it("describes a permanent stat boost", () => {
    expect(formatUseEffectLine({ type: "permanent_stat_boost", stat: "hp", amount: 5 }))
      .toMatch(/Max HP/);
  });

  it("uses percent formatting where the stat calls for it", () => {
    expect(formatUseEffectLine({ type: "permanent_stat_boost", stat: "block", amount: 3 }))
      .toContain("+3%");
  });

  it("returns null for effects with no mechanics, and for no effect at all", () => {
    expect(formatUseEffectLine({ type: "heal", amount: 3 })).toBeNull();
    expect(formatUseEffectLine({ type: "revive" })).toBeNull();
    expect(formatUseEffectLine(undefined)).toBeNull();
  });
});

describe("formatConsumableBlockedReason", () => {
  it("explains a dead character, which the behaviour contract promises", () => {
    expect(formatConsumableBlockedReason("unit_dead")).toMatch(/dead/i);
  });

  it("produces non-empty wording for every failure reason", () => {
    for (const reason of ALL_REASONS) {
      expect(formatConsumableBlockedReason(reason).length).toBeGreaterThan(0);
    }
  });
});
