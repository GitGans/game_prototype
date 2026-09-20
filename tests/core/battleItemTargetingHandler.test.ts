import { describe, it, expect, beforeEach } from "vitest";
import {
  applyBattleTurnAction,
  applyBattleModeChange,
  projectBattleActionFeedback,
  type BattleTurnPhaseAction,
} from "../../src/core/phaseHandlers/battlePhaseHandler";
import type { BattleItemResource } from "../../src/battle/itemUsability";
import { createTurnContext } from "../../src/battle/turnResolver";
import { killUnit } from "../../src/battle/lifeState";
import { buildOccupancy } from "../../src/battle/occupancy";
import type { BattleMode, BattleState } from "../../src/battle/types";
import type { AutoTurnIntention } from "../../src/core/battleRuntimeContext";
import { coord } from "../battle/helpers/coords";
import { makeUnit, resetUnitIdCounter } from "../battle/helpers/units";
import { makeBattleStateFromUnits } from "../battle/helpers/battleState";
import { fixedRng } from "../battle/helpers/rng";
import { testMagicBolt, testStrike } from "../battle/helpers/skills";

/**
 * The handler's explicit instruction for the manual targeting interaction. It is the ONLY thing
 * that lets the runtime owner change the item selection or drop a preview: every refused or no-op
 * action must return its input state by reference and carry no instruction at all.
 */

const SCROLL = "i_scroll";
const FALLEN_CELL = coord("player", 1, 0);

const RESOURCES: ReadonlyMap<string, BattleItemResource> = new Map([
  ["hero", { instanceId: SCROLL, name: "Small Resurrection Scroll", effect: { type: "revive", hpPercent: 30 } }],
]);

function scene(): BattleState {
  const hero   = makeUnit({ id: "hero", side: "player", skills: [testStrike, testMagicBolt] });
  const fallen = makeUnit({ id: "fallen", side: "player", maxHp: 70 });
  const foe    = makeUnit({ id: "foe", side: "enemy" });
  const state = makeBattleStateFromUnits({
    field: [
      { unit: hero, anchor: coord("player", 0, 0) },
      { unit: fallen, anchor: FALLEN_CELL },
      { unit: foe, anchor: coord("enemy", 0, 0) },
    ],
  });
  const units = new Map(state.units);
  units.set("fallen", killUnit(units.get("fallen")!));
  return {
    ...state,
    units,
    occupancy: buildOccupancy(units, state.deployments),
    roundQueue: ["hero", "foe"],
  };
}

/** The scroll already selected, with its target cells and a preview on the corpse. */
function targetingState(): BattleState {
  return { ...scene(), validTargets: [FALLEN_CELL], previewTargetCoord: FALLEN_CELL };
}

function run(
  state: BattleState,
  action: BattleTurnPhaseAction,
  over: { mode?: BattleMode; selected?: string | null; context?: ReturnType<typeof createTurnContext>;
          pending?: AutoTurnIntention | null } = {},
) {
  return applyBattleTurnAction({
    state,
    context: over.context ?? createTurnContext(),
    action,
    mode: over.mode ?? "manual",
    rng: fixedRng(0),
    itemResources: RESOURCES,
    selectedUsableInstanceId: over.selected === undefined ? SCROLL : over.selected,
    pendingAutoTurnIntention: over.pending ?? null,
  });
}

beforeEach(resetUnitIdCounter);

describe("targeting instruction — item actions", () => {
  it("a successful battle_select_item asks to select that instance", () => {
    const result = run(scene(), { type: "battle_select_item", unitId: "hero", instanceId: SCROLL },
      { selected: null });
    expect(result.targeting).toEqual({ type: "select_item", instanceId: SCROLL });
    expect(result.state.validTargets).toEqual([FALLEN_CELL]);
    expect(result.events).toEqual([]);
  });

  it("a successful battle_use_item resets targeting, with a revive outcome", () => {
    const result = run(targetingState(), {
      type: "battle_use_item", unitId: "hero", instanceId: SCROLL, target: FALLEN_CELL,
    });
    expect(result.targeting).toEqual({ type: "reset" });
    expect(result.itemUse).toMatchObject({ kind: "revive", targetUnitId: "fallen", instanceId: SCROLL });
  });

  it("projects revive feedback field by field and never exposes the targeting instruction", () => {
    const result = run(targetingState(), {
      type: "battle_use_item", unitId: "hero", instanceId: SCROLL, target: FALLEN_CELL,
    });
    const feedback = projectBattleActionFeedback(result);
    expect(feedback.itemUse).toEqual({
      applied: true, kind: "revive", itemName: "Small Resurrection Scroll",
      targetUnitId: "fallen", restoredHp: 21,
    });
    expect(feedback).not.toHaveProperty("targeting");
  });
});

describe("targeting instruction — refusals and no-ops keep everything", () => {
  const enemyTurn = () => ({ ...targetingState(), roundQueue: ["foe", "hero"] });

  const cases: Array<[string, () => BattleState, BattleTurnPhaseAction, Parameters<typeof run>[2]]> = [
    ["refused battle_select_item (another unit's instance)", targetingState,
      { type: "battle_select_item", unitId: "hero", instanceId: "i_other" }, {}],
    ["refused battle_use_item (not selected)", targetingState,
      { type: "battle_use_item", unitId: "hero", instanceId: SCROLL, target: FALLEN_CELL },
      { selected: null }],
    ["refused battle_use_item (living target)", targetingState,
      { type: "battle_use_item", unitId: "hero", instanceId: SCROLL, target: coord("player", 0, 0) }, {}],
    ["refused battle_select_skill (enemy turn)", enemyTurn,
      { type: "battle_select_skill", skillIndex: 1 }, {}],
    ["already-charged battle_charge_turn", targetingState,
      { type: "battle_charge_turn" }, { context: { chargedThisRound: new Set(["hero"]) } }],
    ["battle_start_turn → none (quick mode)", targetingState,
      { type: "battle_start_turn" }, { mode: "quick" }],
    ["battle_decide_auto_turn", targetingState, { type: "battle_decide_auto_turn" }, {}],
    ["stale battle_apply_auto_turn", targetingState, { type: "battle_apply_auto_turn" },
      { pending: { type: "advance_turn", unitId: "foe", skillIndex: 0, activeUnitSide: "enemy" } }],
  ];

  for (const [label, makeState, action, over] of cases) {
    it(label, () => {
      const state = makeState();
      const result = run(state, action, over);
      expect(result.targeting).toBeUndefined();
      expect(result.state).toBe(state);
    });
  }
});

describe("targeting instruction — applied actions reset", () => {
  const cases: Array<[string, BattleTurnPhaseAction, Parameters<typeof run>[2]]> = [
    ["battle_select_skill", { type: "battle_select_skill", skillIndex: 1 }, {}],
    ["battle_skip_turn", { type: "battle_skip_turn", reason: "manual_skip" }, {}],
    ["battle_charge_turn", { type: "battle_charge_turn" }, {}],
    ["battle_advance_turn", { type: "battle_advance_turn" }, {}],
    ["battle_start_turn", { type: "battle_start_turn" }, {}],
    ["battle_use_skill",
      { type: "battle_use_skill", unitId: "hero", target: coord("enemy", 0, 0), skillIndex: 1 }, {}],
  ];

  for (const [label, action, over] of cases) {
    it(label, () => {
      expect(run(targetingState(), action, over).targeting).toEqual({ type: "reset" });
    });
  }
});

describe("applyBattleModeChange", () => {
  it("leaving manual control cancels selection, target cells and preview together", () => {
    const state = targetingState();
    const changed = applyBattleModeChange({ state, selectedUsableInstanceId: SCROLL, nextMode: "auto" });
    expect(changed.selectedUsableInstanceId).toBeNull();
    expect(changed.state.validTargets).toEqual([]);
    expect(changed.state.previewTargetCoord).toBeNull();
    expect(changed.state.units).toBe(state.units);
  });

  it("changes nothing without a selection, or when the new mode is manual", () => {
    const state = targetingState();
    expect(applyBattleModeChange({ state, selectedUsableInstanceId: null, nextMode: "auto" }).state)
      .toBe(state);
    const manual = applyBattleModeChange({ state, selectedUsableInstanceId: SCROLL, nextMode: "manual" });
    expect(manual.state).toBe(state);
    expect(manual.selectedUsableInstanceId).toBe(SCROLL);
  });
});
