import { describe, it, expect } from "vitest";
import { executeSkillUse } from "../../src/battle/skillExecution";
import { resolveBattleTransition } from "../../src/battle/battleTransition";
import { createTurnContext } from "../../src/battle/turnResolver";
import { coord } from "./helpers/coords";
import { makeUnit } from "./helpers/units";
import { makeBattleStateFromUnits } from "./helpers/battleState";
import { fixedRng } from "./helpers/rng";
import { testStrike } from "./helpers/skills";

describe("executeSkillUse", () => {
  it("applies a skill but does not advance roundQueue", () => {
    const attacker = makeUnit({
      id: "attacker",
      anchor: coord("player", 0, 0),
      skills: [testStrike],
      dodge: 0,
      block: 0,
    });
    const target = makeUnit({
      id: "target",
      anchor: coord("enemy", 0, 0),
      dodge: 0,
      block: 0,
    });
    const state = makeBattleStateFromUnits([attacker, target], {
      roundQueue: ["attacker", "target"],
    });

    const { state: after } = executeSkillUse({
      state,
      casterId: "attacker",
      target: coord("enemy", 0, 0),
      skill: testStrike,
      queueContext: { chargedThisRound: new Set() },
      rng: fixedRng(0.99), // rng()=1 → always hits, never dodges/blocks
    });

    // executeSkillUse must not modify roundQueue
    expect(after.roundQueue).toEqual(["attacker", "target"]);
    // Damage was applied: target either has reduced HP or was removed (lethal hit)
    const targetAfter = after.units.get("target");
    if (targetAfter) {
      expect(targetAfter.hp).toBeLessThan(100);
    }
  });
});

describe("resolveBattleTransition", () => {
  it("use_skill applies the skill but does not advance roundQueue", () => {
    const attacker = makeUnit({
      id: "attacker",
      anchor: coord("player", 0, 0),
      skills: [testStrike],
      activeSkillIndex: 0,
      dodge: 0,
      block: 0,
    });
    const target = makeUnit({
      id: "target",
      anchor: coord("enemy", 0, 0),
      dodge: 0,
      block: 0,
    });
    const state = makeBattleStateFromUnits([attacker, target], {
      roundQueue: ["attacker", "target"],
    });
    const context = createTurnContext();

    const { state: after } = resolveBattleTransition({
      state,
      context,
      action: {
        type: "use_skill",
        unitId: "attacker",
        target: coord("enemy", 0, 0),
      },
      rng: fixedRng(0.99),
    });

    // use_skill does not advance the queue — that is advance_turn's job
    expect(after.roundQueue).toEqual(["attacker", "target"]);
  });
});
