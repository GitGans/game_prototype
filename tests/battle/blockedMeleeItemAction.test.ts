import { describe, it, expect, beforeEach } from "vitest";
import { resolveActiveTurnStart, createTurnContext } from "../../src/battle/turnResolver";
import type { BattleState } from "../../src/battle/types";
import { makeUnit, resetUnitIdCounter } from "./helpers/units";
import { makeBattleStateFromUnits } from "./helpers/battleState";

/**
 * A manual melee turn with no reachable enemy is normally auto-skipped. A unit carrying a
 * supported item still has a real decision, so the turn must stop and expose its actions —
 * including for a full-health carrier, whose item shows disabled and whose manual skip control
 * stays available.
 */

/**
 * One player melee unit and one enemy, far enough apart that the default melee skill resolves
 * no valid targets.
 */
function blockedMeleeState(): BattleState {
  const hero = makeUnit({ id: "hero", side: "player", hp: 50, maxHp: 100 });
  const foe = makeUnit({ id: "foe", side: "enemy" });
  const state = makeBattleStateFromUnits({
    field: [
      { unit: hero, anchor: { side: "player", row: 0, col: 0 } },
      { unit: foe, anchor: { side: "enemy", row: 2, col: 4 } },
    ],
  });
  return { ...state, roundQueue: ["hero", "foe"], phase: "placement" };
}

const start = (state: BattleState, unitsWithItemAction?: ReadonlySet<string>) =>
  resolveActiveTurnStart({
    state, context: createTurnContext(), mode: "manual", unitsWithItemAction,
  });

beforeEach(resetUnitIdCounter);

describe("blocked melee with an item action", () => {
  it("auto-skips as before when the unit carries nothing", () => {
    const result = start(blockedMeleeState());

    expect(result.events[0]).toMatchObject({ type: "turn_skipped", reason: "blocked_melee" });
    expect(result.directive).toEqual({ type: "schedule_next_turn", delayKind: "manual_next" });
    // The queue advanced past the blocked unit.
    expect(result.state.roundQueue[0]).not.toBe("hero");
  });

  it("stops on the unit when it carries a supported item, with no skip event", () => {
    const result = start(blockedMeleeState(), new Set(["hero"]));

    expect(result.events).toEqual([]);
    expect(result.directive).toEqual({ type: "await_manual_action", activeUnitId: "hero" });
    // The turn is still the carrier's — nothing advanced.
    expect(result.state.roundQueue[0]).toBe("hero");
    expect(result.state.phase).toBe("select_target");
    // No invented target and no misleading attack prompt.
    expect(result.state.validTargets).toEqual([]);
  });

  it("stops for a FULL-HEALTH carrier too — the action shows disabled, it does not vanish", () => {
    const hero = makeUnit({ id: "hero", side: "player", hp: 100, maxHp: 100 });
    const foe = makeUnit({ id: "foe", side: "enemy" });
    const base = makeBattleStateFromUnits({
      field: [
        { unit: hero, anchor: { side: "player", row: 0, col: 0 } },
        { unit: foe, anchor: { side: "enemy", row: 2, col: 4 } },
      ],
    });

    const result = start({ ...base, roundQueue: ["hero", "foe"], phase: "placement" },
                         new Set(["hero"]));

    expect(result.directive).toEqual({ type: "await_manual_action", activeUnitId: "hero" });
  });

  it("does not affect a unit that is not in the carrier set", () => {
    const result = start(blockedMeleeState(), new Set(["someone_else"]));

    expect(result.directive).toEqual({ type: "schedule_next_turn", delayKind: "manual_next" });
  });
});
