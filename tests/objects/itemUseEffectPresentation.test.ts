import { describe, it, expect } from "vitest";
import {
  formatItemUsePrompt,
  formatUseEffectLine,
  formatItemBlockedReason,
  formatBattleItemActionTooltip,
} from "../../src/objects/itemUseEffectPresentation";
import type { ItemUseFailure } from "../../src/shared/itemTypes";

/**
 * Every failure the pipeline can report, listed by hand so the exhaustiveness check below is a
 * real assertion rather than a restatement of the source. A new reason fails to compile here.
 */
const ALL_REASONS: ItemUseFailure[] = [
  "missing_instance",
  "missing_definition",
  "not_usable_from_here",
  "missing_use_effect",
  "not_in_backpack",
  "duplicate_placement",
  "unit_dead",
  "invalid_amount",
  "invalid_result",
  "unit_full_hp",
  "unit_not_found",
  "blueprint_not_found",
  "unsupported_effect",
];

describe("formatItemUsePrompt", () => {
  it("names both the permanent max-HP growth and the immediate heal for an HP boost", () => {
    const text = formatItemUsePrompt({
      instanceId: "i1", unitTemplateId: "warrior",
      unitName: "Warrior", itemName: "Vitality Essence",
      effect: { type: "permanent_stat_boost", stat: "hp", amount: 5, healsCurrentHp: true },
    });

    expect(text).toContain("Vitality Essence");
    expect(text).toContain("Warrior");
    expect(text).toMatch(/Max HP/);
    expect(text).toMatch(/permanent/i);
    expect(text).toMatch(/restores 5 HP/i);
  });

  it("states only the permanent gain for a non-HP boost", () => {
    const text = formatItemUsePrompt({
      instanceId: "i2", unitTemplateId: "warrior",
      unitName: "Warrior",  itemName: "Might Essence",
      effect: {
        type: "permanent_stat_boost", stat: "physicalStrength", amount: 2, healsCurrentHp: false,
      },
    });

    expect(text).toContain("+2 Phys Str");
    expect(text).toMatch(/permanent/i);
    expect(text).not.toMatch(/restores/i);
  });

  it("reports the actual restoration and the resulting HP for a heal, with no permanent claim", () => {
    const text = formatItemUsePrompt({
      instanceId: "i3", unitTemplateId: "warrior",
      unitName: "Warrior", itemName: "Small Healing Potion",
      effect: { type: "heal", amount: 10, restoredHp: 3, currentHp: 27, maxHp: 30 },
    });

    expect(text).toContain("Small Healing Potion");
    expect(text).toContain("Warrior");
    // The CLAMPED restoration, not the item's nominal 10.
    expect(text).toMatch(/restores 3 HP/i);
    expect(text).toContain("27");
    expect(text).toContain("30");
    expect(text).not.toMatch(/10/);
    // Ordinary healing must never read as growth.
    expect(text).not.toMatch(/permanent/i);
    expect(text).not.toMatch(/max hp/i);
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

  it("describes a heal by its nominal ceiling — the line is target-independent", () => {
    const text = formatUseEffectLine({ type: "heal", amount: 10 })!;
    expect(text).toMatch(/up to 10 HP/i);
    expect(text).not.toMatch(/permanent/i);
    expect(text).not.toMatch(/max hp/i);
  });

  it("states a resurrection's authored share of max HP, and returns null for no effect", () => {
    expect(formatUseEffectLine({ type: "revive", hpPercent: 30 })).toBe("Revives with 30% HP.");
    expect(formatUseEffectLine({ type: "revive", hpPercent: 55 })).toBe("Revives with 55% HP.");
    expect(formatUseEffectLine(undefined)).toBeNull();
  });
});

describe("formatItemBlockedReason", () => {
  it("explains a dead character, which the behaviour contract promises", () => {
    expect(formatItemBlockedReason("unit_dead")).toMatch(/dead/i);
  });

  it("produces non-empty wording for every failure reason", () => {
    for (const reason of ALL_REASONS) {
      expect(formatItemBlockedReason(reason).length).toBeGreaterThan(0);
    }
  });
});

describe("formatBattleItemActionTooltip", () => {
  it("describes the scroll, its cost and — when disabled — why", () => {
    const effect = { type: "revive", hpPercent: 30 } as const;
    expect(formatBattleItemActionTooltip("Small Resurrection Scroll", effect, null))
      .toBe("Small Resurrection Scroll Revives with 30% HP. Uses up the item and ends the turn.");
    expect(formatBattleItemActionTooltip("Small Resurrection Scroll", effect, "no_valid_targets"))
      .toMatch(/No fallen ally to revive\.$/);
  });

  it("words the new targeting refusals", () => {
    const effect = { type: "revive", hpPercent: 30 } as const;
    expect(formatBattleItemActionTooltip("S", effect, "item_not_selected")).toMatch(/Select the item first\./);
    expect(formatBattleItemActionTooltip("S", effect, "invalid_target")).toMatch(/Not a valid target/);
  });
});
