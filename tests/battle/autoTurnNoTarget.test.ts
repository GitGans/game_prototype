import { describe, it, expect, beforeEach } from "vitest";
import { decideAutoTurn } from "../../src/battle/autoTurn";
import type { BattleState } from "../../src/battle/types";
import type { ActionSkillDefinition } from "../../src/shared/skillDefinitionTypes";
import { makeUnit, resetUnitIdCounter } from "./helpers/units";
import { makeBattleStateFromUnits } from "./helpers/battleState";
import { fixedRng, sequenceRng } from "./helpers/rng";
import { testStrike, testMagicBolt, testRevive } from "./helpers/skills";

/**
 * Automatic turns never wait for input. A targetless first skill does not stop the existing
 * selector from choosing another skill that has targets; with nothing executable, the turn is
 * completed through the existing skip/advance outcomes.
 */

/** A back-row hero behind a living front-row guard: melee is blocked by the real targeting rules. */
function blockedHeroState(heroSkills: ActionSkillDefinition[]): BattleState {
  const hero  = makeUnit({ id: "hero",  side: "player", skills: heroSkills });
  const guard = makeUnit({ id: "guard", side: "player" });
  const foe   = makeUnit({ id: "foe",   side: "enemy" });
  const state = makeBattleStateFromUnits({
    field: [
      { unit: hero,  anchor: { side: "player", row: 1, col: 0 } },
      { unit: guard, anchor: { side: "player", row: 0, col: 0 } },
      { unit: foe,   anchor: { side: "enemy",  row: 0, col: 0 } },
    ],
  });
  return { ...state, roundQueue: ["hero", "guard", "foe"] };
}

beforeEach(resetUnitIdCounter);

describe("decideAutoTurn — targetless first skill", () => {
  it("selects another skill that has targets", () => {
    const decision = decideAutoTurn({
      state: blockedHeroState([testStrike, testMagicBolt]),
      mode:  "auto",
      rng:   fixedRng(0),
    });

    expect(decision).toEqual({
      type: "use_skill", unitId: "hero", skillIndex: 1,
      target: { side: "enemy", row: 0, col: 0 },
    });
  });

  it("skips a blocked melee turn when nothing else is executable", () => {
    const decision = decideAutoTurn({
      state: blockedHeroState([testStrike]),
      mode:  "auto",
      rng:   fixedRng(0),
    });

    expect(decision).toEqual({ type: "skip_turn", unitId: "hero", skillIndex: 0, reason: "blocked_melee" });
  });

  it("advances a non-melee targetless turn", () => {
    const decision = decideAutoTurn({
      state: blockedHeroState([testRevive]),
      mode:  "auto",
      rng:   fixedRng(0),
    });

    expect(decision).toEqual({ type: "advance_turn", unitId: "hero", skillIndex: 0 });
  });

  it("is deterministic for a fixed seed", () => {
    const state = blockedHeroState([testStrike, testMagicBolt, testRevive]);
    const first  = decideAutoTurn({ state, mode: "auto", rng: sequenceRng([0.1, 0.7, 0.3]) });
    const second = decideAutoTurn({ state, mode: "auto", rng: sequenceRng([0.1, 0.7, 0.3]) });

    expect(second).toEqual(first);
  });

  it("still hands a manual-mode player back to the manual flow", () => {
    const decision = decideAutoTurn({
      state: blockedHeroState([testStrike]),
      mode:  "manual",
      rng:   fixedRng(0),
    });

    expect(decision).toEqual({ type: "handoff_manual" });
  });
});
