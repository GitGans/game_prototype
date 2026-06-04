import { describe, it, expect } from "vitest";
import { setBattlePreviewTarget } from "../../src/core/phaseHandlers/battlePhaseHandler";
import { makeBattleStateFromUnits } from "../battle/helpers/battleState";
import { makeUnit } from "../battle/helpers/units";
import { coord } from "../battle/helpers/coords";

describe("setBattlePreviewTarget", () => {
  const baseState = () =>
    makeBattleStateFromUnits({
      field: [{ unit: makeUnit({ id: "p1", side: "player" }), anchor: coord("player", 0, 0) }],
    });

  it("stores a copied coord (no aliasing of the action argument)", () => {
    const state = baseState();
    const target = coord("enemy", 0, 1);

    const next = setBattlePreviewTarget(state, target);

    expect(next.previewTargetCoord).toEqual(target);
    expect(next.previewTargetCoord).not.toBe(target); // copied, not the same reference
    expect(next).not.toBe(state); // new state, never mutated in place
    expect(state.previewTargetCoord).toBeNull(); // input untouched
  });

  it("clears the preview target when passed null", () => {
    const state = setBattlePreviewTarget(baseState(), coord("enemy", 0, 1));
    expect(state.previewTargetCoord).not.toBeNull();

    const cleared = setBattlePreviewTarget(state, null);
    expect(cleared.previewTargetCoord).toBeNull();
  });
});
