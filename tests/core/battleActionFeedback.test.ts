import { describe, expect, it } from "vitest";
import {
  projectBattleActionFeedback,
  type BattlePhaseActionResult,
} from "../../src/core/phaseHandlers/battlePhaseHandler";
import type { BattleState } from "../../src/battle/types";
import type { TurnContext, TurnStartDirective } from "../../src/battle/turnResolver";
import type { BattleEvent } from "../../src/battle/battleEvents";
import type { CellCoord } from "../../src/shared/gridTypes";

/**
 * Focused contract for the one seam that separates the handler's authoritative
 * result from what a scene is allowed to see.
 *
 * Four of the five public feedback fields are OPTIONAL, so deleting any of the
 * projection's `if (result.X !== undefined)` lines still compiles. Nothing else in
 * the suite would fail. This file is that guard — plus the guard against the
 * subtler leak: nested objects (`directive`, `intention`) that alias committed
 * BattleState or the installed BattleRuntimeContext.
 */

const ACTIVE_UNIT_ID = "soldier";
const AUTO_UNIT_ID = "archer";

// The projection reads neither of these; they exist so the fixture is a real
// BattlePhaseActionResult and the "did an authoritative field cross over?"
// assertions have something to detect.
const AUTHORITATIVE_STATE = { phase: "select_target" } as unknown as BattleState;
const AUTHORITATIVE_CONTEXT = { round: 3 } as unknown as TurnContext;

const EVENTS: BattleEvent[] = [
  {
    type: "skill_damage",
    casterId: ACTIVE_UNIT_ID,
    casterName: "Soldier",
    targetId: "orc",
    targetName: "Orc",
    amount: 7,
    blocked: false,
  },
];

/**
 * The same array object BattleState.validTargets holds — resolveActiveTurnStart()
 * builds both from one local, so this aliasing is the production shape, not a
 * contrived one.
 */
const SHARED_VALID_TARGETS: CellCoord[] = [{ side: "enemy", row: 0, col: 1 }];

const INTERNAL_AWAIT_MANUAL_TARGET = {
  type: "await_manual_target",
  activeUnitId: ACTIVE_UNIT_ID,
  activeSkill: { id: "strike", kind: "action" },
  validTargets: SHARED_VALID_TARGETS,
  promptKind: "attack",
} as unknown as TurnStartDirective;

function createFullResult(): BattlePhaseActionResult {
  return {
    state: AUTHORITATIVE_STATE,
    context: AUTHORITATIVE_CONTEXT,
    events: EVENTS,
    directive: INTERNAL_AWAIT_MANUAL_TARGET,
    winner: "player",
    autoTurnDirective: {
      type: "intention",
      intention: {
        type: "use_skill",
        unitId: AUTO_UNIT_ID,
        skillIndex: 2,
        target: { side: "enemy", row: 1, col: 0 },
        activeUnitSide: "player",
      },
      animateAttack: true,
    },
    autoTurnApplied: true,
  };
}

describe("projectBattleActionFeedback", () => {
  it("maps every public field, and only public fields", () => {
    const result = createFullResult();

    const feedback = projectBattleActionFeedback(result);

    expect(feedback).toEqual({
      events: EVENTS,
      directive: {
        type: "await_manual_target",
        activeUnitId: ACTIVE_UNIT_ID,
        promptKind: "attack",
      },
      winner: "player",
      autoTurnDirective: {
        type: "intention",
        intention: { unitId: AUTO_UNIT_ID, activeUnitSide: "player" },
        animateAttack: true,
      },
      autoTurnApplied: true,
    });
  });

  it("does not forward authoritative handler fields", () => {
    const feedback = projectBattleActionFeedback(createFullResult());

    expect("state" in feedback).toBe(false);
    expect("context" in feedback).toBe(false);
  });

  it("drops the directive's internal skill definition and BattleState-aliasing targets", () => {
    const feedback = projectBattleActionFeedback(createFullResult());

    expect("activeSkill" in feedback.directive!).toBe(false);
    expect("validTargets" in feedback.directive!).toBe(false);
  });

  it("drops the intention's authoritative action payload", () => {
    const feedback = projectBattleActionFeedback(createFullResult());
    const intention = (feedback.autoTurnDirective as { intention: object }).intention;

    expect("type" in intention).toBe(false);
    expect("skillIndex" in intention).toBe(false);
    expect("target" in intention).toBe(false);
    expect("reason" in intention).toBe(false);
  });

  it("shares no object reference with the handler result at any depth", () => {
    const result = createFullResult();

    const feedback = projectBattleActionFeedback(result);

    expect(feedback.events).not.toBe(result.events);
    expect(feedback.directive).not.toBe(result.directive);
    expect(feedback.autoTurnDirective).not.toBe(result.autoTurnDirective);
    expect((feedback.autoTurnDirective as { intention: object }).intention).not.toBe(
      (result.autoTurnDirective as { intention: object }).intention,
    );
  });

  it("cannot mutate the handler result or the runtime-owned intention through the feedback", () => {
    const result = createFullResult();
    const originalEventCount = result.events.length;
    const originalIntention = (result.autoTurnDirective as { intention: { unitId: string } })
      .intention;

    const feedback = projectBattleActionFeedback(result);
    feedback.events.push({
      type: "skill_damage",
      casterId: "x",
      casterName: "X",
      targetId: "y",
      targetName: "Y",
      amount: 1,
      blocked: false,
    });
    (feedback.autoTurnDirective as { intention: { unitId: string } }).intention.unitId =
      "tampered";

    expect(result.events).toHaveLength(originalEventCount);
    expect(originalIntention.unitId).toBe(AUTO_UNIT_ID);
    expect(SHARED_VALID_TARGETS).toHaveLength(1);
  });

  it("omits absent optional fields rather than writing undefined keys", () => {
    const feedback = projectBattleActionFeedback({
      state: AUTHORITATIVE_STATE,
      context: AUTHORITATIVE_CONTEXT,
      events: [],
    });

    expect(Object.keys(feedback)).toEqual(["events"]);
  });

  // Per-variant coverage: the `never` defaults make a dropped VARIANT a compile
  // error, but a dropped FIELD inside a variant is silent. These pin the payloads.
  const DIRECTIVE_CASES: ReadonlyArray<[string, unknown, unknown]> = [
    [
      "none",
      { type: "none", reason: "battle_ended" },
      { type: "none", reason: "battle_ended" },
    ],
    ["continue_immediately", { type: "continue_immediately" }, { type: "continue_immediately" }],
    [
      "schedule_auto_turn",
      { type: "schedule_auto_turn", activeUnitId: ACTIVE_UNIT_ID, delayKind: "auto_enemy" },
      { type: "schedule_auto_turn", activeUnitId: ACTIVE_UNIT_ID, delayKind: "auto_enemy" },
    ],
    [
      "await_manual_target",
      INTERNAL_AWAIT_MANUAL_TARGET,
      { type: "await_manual_target", activeUnitId: ACTIVE_UNIT_ID, promptKind: "attack" },
    ],
    [
      "await_manual_action",
      { type: "await_manual_action", activeUnitId: ACTIVE_UNIT_ID },
      { type: "await_manual_action", activeUnitId: ACTIVE_UNIT_ID },
    ],
  ];

  it.each(DIRECTIVE_CASES)("projects the %s directive exactly", (_name, internal, expected) => {
    const feedback = projectBattleActionFeedback({
      state: AUTHORITATIVE_STATE,
      context: AUTHORITATIVE_CONTEXT,
      events: [],
      directive: internal as TurnStartDirective,
    });

    expect(feedback.directive).toEqual(expected);
  });

  const AUTO_TURN_CASES: ReadonlyArray<[string, unknown, unknown]> = [
    [
      "none",
      { type: "none", reason: "non_auto_mode" },
      { type: "none", reason: "non_auto_mode" },
    ],
    ["handoff_manual", { type: "handoff_manual" }, { type: "handoff_manual" }],
    ["restart_turn", { type: "restart_turn" }, { type: "restart_turn" }],
    [
      "intention",
      {
        type: "intention",
        intention: {
          type: "skip_turn",
          unitId: AUTO_UNIT_ID,
          skillIndex: 0,
          reason: "blocked_melee",
          activeUnitSide: "enemy",
        },
        animateAttack: false,
      },
      {
        type: "intention",
        intention: { unitId: AUTO_UNIT_ID, activeUnitSide: "enemy" },
        animateAttack: false,
      },
    ],
  ];

  it.each(AUTO_TURN_CASES)(
    "projects the %s auto-turn directive exactly",
    (_name, internal, expected) => {
      const feedback = projectBattleActionFeedback({
        state: AUTHORITATIVE_STATE,
        context: AUTHORITATIVE_CONTEXT,
        events: [],
        autoTurnDirective: internal as BattlePhaseActionResult["autoTurnDirective"],
      });

      expect(feedback.autoTurnDirective).toEqual(expected);
    },
  );
});
