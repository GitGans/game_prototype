import { describe, it, expect } from "vitest";
import { applyBattleTurnAction } from "../../src/core/phaseHandlers/battlePhaseHandler";
import { createTurnContext } from "../../src/battle/turnResolver";
import { killUnit } from "../../src/battle/lifeState";
import { buildOccupancy } from "../../src/battle/occupancy";
import type { BattleState } from "../../src/battle/types";
import { coord } from "../battle/helpers/coords";
import { makeUnit } from "../battle/helpers/units";
import { makeBattleStateFromUnits } from "../battle/helpers/battleState";
import { fixedRng } from "../battle/helpers/rng";
import { testStrike } from "../battle/helpers/skills";

function setDead(state: BattleState, id: string): BattleState {
  const u = state.units.get(id)!;
  const units = new Map(state.units);
  units.set(id, killUnit(u));
  return { ...state, units, occupancy: buildOccupancy(units, state.deployments) };
}

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
    // Death is now a state transition, not deletion (Stage 2).
    expect(result.state.units.get("enemy")?.lifeState).toBe("dead");
    expect(result.state.units.get("enemy")?.hp).toBe(0);
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

describe("applyBattleTurnAction — battle_apply_auto_turn stale-intention guard", () => {
  it("rejects a stale auto-turn intention when the intended unit has died", () => {
    // Construct a state where the pending auto-turn intention points at a unit
    // that died in the 200 ms delay window between decide and apply.
    const actor = makeUnit({
      id:               "actor",
      side:             "enemy",
      physicalStrength: 10,
      skills:           [testStrike],
    });
    const player = makeUnit({ id: "player", side: "player", hp: 100, maxHp: 100 });

    let state = makeBattleStateFromUnits(
      {
        field: [
          { unit: actor,  anchor: coord("enemy",  0, 0) },
          { unit: player, anchor: coord("player", 0, 0) },
        ],
      },
      { roundQueue: ["actor", "player"] },
    );
    // The intention was decided when `actor` was alive; now `actor` is dead.
    state = setDead(state, "actor");

    const result = applyBattleTurnAction({
      state,
      context: createTurnContext(),
      action: { type: "battle_apply_auto_turn" },
      mode:   "auto",
      rng:    fixedRng(0.99),
      pendingAutoTurnIntention: {
        type:           "use_skill",
        unitId:         "actor",
        skillIndex:     0,
        target:         coord("player", 0, 0),
        activeUnitSide: "enemy",
      },
    });

    expect(result.autoTurnApplied).toBe(false);
    expect(result.events).toEqual([]);
    expect(result.state.units.get("player")?.hp).toBe(100); // skill never landed
  });
});
