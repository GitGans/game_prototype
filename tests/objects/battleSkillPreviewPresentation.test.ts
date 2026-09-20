import { describe, it, expect } from "vitest";
import { buildBattleTargetPreviewPresentation } from "../../src/objects/battleSkillPreviewPresentation";
import type { BattleTargetPreviewModel } from "../../src/shared/skillPreviewModel";

/**
 * All target-preview wording lives here. The battle domain hands over structured data only, so
 * the item variant's sentence is produced — and pinned — in the presentation layer.
 */

const CELL = { side: "player" as const, row: 1 as const, col: 0 as const };

describe("buildBattleTargetPreviewPresentation", () => {
  it("formats an item resurrection from structured data: item header, target and restored HP", () => {
    const model: BattleTargetPreviewModel = {
      kind: "item_revive",
      itemName: "Small Resurrection Scroll",
      targetName: "Archer",
      restoredHp: 21,
      cells: [{ coord: CELL, kind: "effect", highlight: "revive" }],
    };

    expect(buildBattleTargetPreviewPresentation(model)).toEqual({
      cells: [{ coord: CELL, kind: "effect", highlight: "revive" }],
      statusHeader: { text: "Small Resurrection Scroll", colorKind: "neutral" },
      statusBody: "Preview:\nArcher revived +21 HP\n[click again to confirm]",
    });
  });

  it("formats a skill preview exactly as before", () => {
    const model: BattleTargetPreviewModel = {
      kind: "skill",
      cells: [{ coord: CELL, kind: "skill", highlight: "damage", multiplier: 1 }],
      statusHeader: { text: "Strike", colorKind: "physical" },
      statusLines: ["Foe -12", "[Self vampirism 10%]"],
    };

    expect(buildBattleTargetPreviewPresentation(model)).toEqual({
      cells: model.cells,
      statusHeader: { text: "Strike", colorKind: "physical" },
      statusBody: "Preview:\nFoe -12\n[Self vampirism 10%]\n[click again to confirm]",
    });
  });
});
