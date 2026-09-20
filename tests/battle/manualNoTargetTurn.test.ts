import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveActiveTurnStart,
  switchActiveSkillForManualTurn,
  skipActiveTurn,
  chargeActiveTurn,
  createTurnContext,
  type TurnContext,
} from "../../src/battle/turnResolver";
import { killUnit } from "../../src/battle/lifeState";
import { buildOccupancy } from "../../src/battle/occupancy";
import type { BattleState, Unit } from "../../src/battle/types";
import type { ActionSkillDefinition } from "../../src/shared/skillDefinitionTypes";
import { makeUnit, resetUnitIdCounter } from "./helpers/units";
import { makeBattleStateFromUnits } from "./helpers/battleState";
import { testStrike, testMagicBolt, testRevive } from "./helpers/skills";

/**
 * A living player in manual mode keeps the turn even when the selected skill has no valid targets.
 * The turn stops on that unit with `await_manual_action` — whatever the target policy, and whether
 * or not the unit carries an item. Nothing is chosen or completed on the player's behalf.
 */

/**
 * A back-row hero behind a living front-row guard: melee is blocked under the real targeting rules
 * (`getMeleeTargets`), while the front-row foe is still a valid ranged target.
 */
function blockedMeleeState(skills: ActionSkillDefinition[] = [testStrike]): BattleState {
  const hero  = makeUnit({ id: "hero",  side: "player", hp: 50, maxHp: 100, skills });
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

/** The same hero in the FRONT row, so its melee reaches the foe. */
function reachableMeleeState(): BattleState {
  const hero = makeUnit({ id: "hero", side: "player" });
  const foe  = makeUnit({ id: "foe",  side: "enemy" });
  const state = makeBattleStateFromUnits({
    field: [
      { unit: hero, anchor: { side: "player", row: 0, col: 0 } },
      { unit: foe,  anchor: { side: "enemy",  row: 0, col: 0 } },
    ],
  });
  return { ...state, roundQueue: ["hero", "foe"] };
}

function withUnit(state: BattleState, unit: Unit): BattleState {
  const units = new Map(state.units);
  units.set(unit.id, unit);
  return { ...state, units, occupancy: buildOccupancy(units, state.deployments) };
}

const start = (state: BattleState, context: TurnContext = createTurnContext()) =>
  resolveActiveTurnStart({ state, context, mode: "manual" });

/** Everything a waiting player must leave untouched. */
function expectNothingAdvanced(before: BattleState, after: BattleState): void {
  expect(after.roundQueue).toEqual(before.roundQueue);
  for (const [id, unit] of before.units) {
    const next = after.units.get(id)!;
    expect(next.hp).toBe(unit.hp);
    expect(next.lifeState).toBe(unit.lifeState);
    expect(next.activeEffects).toEqual(unit.activeEffects);
  }
}

beforeEach(resetUnitIdCounter);

describe("manual turn start — selected skill has no targets", () => {
  it("waits for the player on blocked melee, with no item involved", () => {
    const before = blockedMeleeState();
    const result = start(before);

    expect(result.events).toEqual([]);
    expect(result.directive).toEqual({ type: "await_manual_action", activeUnitId: "hero" });
    expect(result.state.phase).toBe("select_target");
    // No invented target and no misleading attack prompt.
    expect(result.state.validTargets).toEqual([]);
    expectNothingAdvanced(before, result.state);
  });

  it("does not switch to another skill that has targets", () => {
    const result = start(blockedMeleeState([testStrike, testMagicBolt]));

    expect(result.directive).toEqual({ type: "await_manual_action", activeUnitId: "hero" });
    expect(result.state.units.get("hero")!.activeSkillIndex).toBe(0);
  });

  it("still keeps control when NO skill has targets", () => {
    const result = start(blockedMeleeState([testStrike, testRevive]));

    expect(result.directive).toEqual({ type: "await_manual_action", activeUnitId: "hero" });
    expect(result.events).toEqual([]);
  });

  it("applies to non-melee policies too — a revive with no fallen ally", () => {
    const result = start(blockedMeleeState([testRevive]));

    expect(result.directive).toEqual({ type: "await_manual_action", activeUnitId: "hero" });
    expect(result.state.validTargets).toEqual([]);
  });

  it("resets a previously selected skill to index 0 before deciding", () => {
    const base = blockedMeleeState([testStrike, testMagicBolt]);
    const hero = base.units.get("hero")!;
    const result = start(withUnit(base, { ...hero, activeSkillIndex: 1 }));

    expect(result.state.units.get("hero")!.activeSkillIndex).toBe(0);
    expect(result.directive).toEqual({ type: "await_manual_action", activeUnitId: "hero" });
  });

  it("leaves charge tracking untouched", () => {
    const context = createTurnContext();
    const result = start(blockedMeleeState(), context);

    expect(result.context).toBe(context);
    expect(result.context.chargedThisRound).toBe(context.chargedThisRound);
  });
});

describe("manual turn start — selected skill has targets", () => {
  it("still prompts for a target", () => {
    const result = start(reachableMeleeState());

    expect(result.events).toEqual([]);
    expect(result.directive).toMatchObject({
      type:         "await_manual_target",
      activeUnitId: "hero",
      promptKind:   "attack",
      validTargets: [{ side: "enemy", row: 0, col: 0 }],
    });
    expect(result.state.validTargets).toEqual([{ side: "enemy", row: 0, col: 0 }]);
  });
});

describe("switching skills while waiting", () => {
  it("moves between targetless and targetable skills without completing the turn", () => {
    const waiting = start(blockedMeleeState([testStrike, testMagicBolt])).state;

    const toRanged = switchActiveSkillForManualTurn({ state: waiting, skillIndex: 1 });
    expect(toRanged.state.units.get("hero")!.activeSkillIndex).toBe(1);
    expect(toRanged.state.validTargets).toEqual([{ side: "enemy", row: 0, col: 0 }]);
    expectNothingAdvanced(waiting, toRanged.state);

    const backToMelee = switchActiveSkillForManualTurn({ state: toRanged.state, skillIndex: 0 });
    expect(backToMelee.state.units.get("hero")!.activeSkillIndex).toBe(0);
    expect(backToMelee.state.validTargets).toEqual([]);
    expectNothingAdvanced(waiting, backToMelee.state);
  });
});

describe("what still advances", () => {
  it("recovers from a dead active entry through advanceTurn", () => {
    const base = blockedMeleeState();
    const dead = withUnit(base, killUnit(base.units.get("hero")!));

    const result = start(dead);

    expect(result.directive).toEqual({ type: "continue_immediately" });
    expect(result.state.roundQueue[0]).not.toBe("hero");
  });

  it("recovers from a missing active entry through advanceTurn", () => {
    const base = blockedMeleeState();
    const result = start({ ...base, roundQueue: ["ghost", ...base.roundQueue] });

    expect(result.directive).toEqual({ type: "continue_immediately" });
    expect(result.state.roundQueue[0]).toBe("hero");
  });

  it("an explicit skip from the waiting state still skips and advances", () => {
    const waiting = start(blockedMeleeState());
    const skipped = skipActiveTurn({ state: waiting.state, context: waiting.context });

    expect(skipped.skipped).toBe(true);
    expect(skipped.events[0]).toMatchObject({ type: "turn_skipped", unitId: "hero", reason: "manual_skip" });
    expect(skipped.state.roundQueue).toEqual(["guard", "foe"]);
  });

  it("an explicit charge from the waiting state still moves the unit to the end", () => {
    const waiting = start(blockedMeleeState());
    const charged = chargeActiveTurn({ state: waiting.state, context: waiting.context });

    expect(charged.charged).toBe(true);
    expect(charged.events).toEqual([{ type: "turn_charged", unitId: "hero", unitName: "Test Unit" }]);
    expect(charged.state.roundQueue).toEqual(["guard", "foe", "hero"]);
    expect(charged.context.chargedThisRound.has("hero")).toBe(true);
  });
});
