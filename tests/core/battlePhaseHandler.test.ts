import { describe, it, expect } from "vitest";
import { applyBattleTurnAction } from "../../src/core/phaseHandlers/battlePhaseHandler";
import { createTurnContext } from "../../src/battle/turnResolver";
import { coord } from "../battle/helpers/coords";
import { makeUnit } from "../battle/helpers/units";
import { makeBattleStateFromUnits } from "../battle/helpers/battleState";
import { fixedRng } from "../battle/helpers/rng";
import { testStrike } from "../battle/helpers/skills";

describe("applyBattleTurnAction — battle_use_skill", () => {
  it("ends the battle immediately when skill damage kills the last opposing unit", () => {
    const attacker = makeUnit({
      id:               "attacker",
      side:             "player",
      physicalStrength: 1000, // guaranteed kill
      skills:           [testStrike],
      activeSkillIndex: 0,
      dodge:            0,
      block:            0,
    });
    const enemy = makeUnit({
      id:    "enemy",
      side:  "enemy",
      hp:    1,
      maxHp: 100,
      dodge: 0,
      block: 0,
    });
    const state = makeBattleStateFromUnits(
      {
        field: [
          { unit: attacker, anchor: coord("player", 0, 0) },
          { unit: enemy,    anchor: coord("enemy",  0, 0) },
        ],
      },
      { roundQueue: ["attacker", "enemy"] },
    );
    const context = createTurnContext();

    const result = applyBattleTurnAction({
      state,
      context,
      action: {
        type:   "battle_use_skill",
        unitId: "attacker",
        target: coord("enemy", 0, 0),
      },
      mode: "manual",
      rng:  fixedRng(0.99),
    });

    expect(result.state.phase).toBe("end");
    expect(result.state.units.has("enemy")).toBe(false);
  });

  it("advances the turn when the battle does not end after skill application", () => {
    const attacker = makeUnit({
      id:               "attacker",
      side:             "player",
      physicalStrength: 10, // not a kill
      skills:           [testStrike],
      activeSkillIndex: 0,
      dodge:            0,
      block:            0,
    });
    const enemy = makeUnit({
      id:    "enemy",
      side:  "enemy",
      hp:    100,
      maxHp: 100,
      dodge: 0,
      block: 0,
    });
    const state = makeBattleStateFromUnits(
      {
        field: [
          { unit: attacker, anchor: coord("player", 0, 0) },
          { unit: enemy,    anchor: coord("enemy",  0, 0) },
        ],
      },
      { roundQueue: ["attacker", "enemy"] },
    );
    const context = createTurnContext();

    const result = applyBattleTurnAction({
      state,
      context,
      action: {
        type:   "battle_use_skill",
        unitId: "attacker",
        target: coord("enemy", 0, 0),
      },
      mode: "manual",
      rng:  fixedRng(0.99),
    });

    expect(result.state.phase).not.toBe("end");
    // battle_use_skill is a compound action: skill → game-over check → advance_turn.
    // After consuming attacker's slot, enemy is the only remaining unit.
    expect(result.state.roundQueue[0]).toBe("enemy");
    const enemyAfter = result.state.units.get("enemy");
    expect(enemyAfter).toBeDefined();
    expect(enemyAfter!.hp).toBeLessThan(100);
  });
});
