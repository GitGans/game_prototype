import { describe, it, expect, beforeEach } from "vitest";
import type { BattleMode, BattleState } from "../../src/battle/types";
import type { ReadonlyItemUseEffect } from "../../src/shared/itemTypes";
import {
  evaluateBattleItemUse,
  getBattleItemTargetMode,
  isSupportedBattleItemEffect,
  type BattleItemResource,
} from "../../src/battle/itemUsability";
import { applyBattleItemUse } from "../../src/battle/itemUse";
import { makeUnit, resetUnitIdCounter } from "./helpers/units";
import { makeBattleStateFromUnits } from "./helpers/battleState";

/**
 * In-battle activation of an equipped usable item. The amount always comes from the supplied
 * resource — there is no 10-HP code path anywhere, which is what makes a new potion size pure
 * authored data.
 */

const HEAL_10: ReadonlyItemUseEffect = { type: "heal", amount: 10 };

function potion(overrides: Partial<BattleItemResource> = {}): BattleItemResource {
  return { instanceId: "i_potion", name: "Small Healing Potion", effect: HEAL_10, ...overrides };
}

function scene(input: { hp?: number; mode?: BattleMode; dead?: boolean } = {}) {
  const hero = makeUnit({
    id: "hero", side: "player", hp: input.dead ? 0 : (input.hp ?? 50), maxHp: 100,
    lifeState: input.dead ? "dead" : "alive",
  });
  const foe = makeUnit({ id: "foe", side: "enemy" });
  const state = makeBattleStateFromUnits({
    field: [
      { unit: hero, anchor: { side: "player", row: 1, col: 1 } },
      { unit: foe, anchor: { side: "enemy", row: 1, col: 1 } },
    ],
  });
  return { state: { ...state, roundQueue: ["hero", "foe"] }, mode: input.mode ?? "manual" as BattleMode };
}

const evaluate = (state: BattleState, mode: BattleMode, over: Record<string, unknown> = {}) =>
  evaluateBattleItemUse({
    state, mode, unitId: "hero", instanceId: "i_potion",
    resource: potion(), alreadyConsumed: false, ...over,
  });

beforeEach(resetUnitIdCounter);

describe("isSupportedBattleItemEffect", () => {
  it("supports heal and revive — one definition, shared by the bar, the resolver and execution", () => {
    expect(isSupportedBattleItemEffect({ type: "heal", amount: 1 })).toBe(true);
    expect(isSupportedBattleItemEffect({ type: "revive", hpPercent: 30 })).toBe(true);
    expect(isSupportedBattleItemEffect({ type: "permanent_stat_boost", stat: "hp", amount: 1 }))
      .toBe(false);
  });

  it("derives support from the target mode: self for heal, dead_ally for revive", () => {
    expect(getBattleItemTargetMode({ type: "heal", amount: 1 })).toBe("self");
    expect(getBattleItemTargetMode({ type: "revive", hpPercent: 30 })).toBe("dead_ally");
    expect(getBattleItemTargetMode({ type: "permanent_stat_boost", stat: "hp", amount: 1 }))
      .toBeNull();
  });
});

describe("evaluateBattleItemUse", () => {
  it("accepts a wounded active player unit on its own manual turn", () => {
    const { state, mode } = scene({ hp: 50 });
    expect(evaluate(state, mode)).toEqual({ ok: true, effect: { type: "heal", amount: 10 } });
  });

  it("reads the amount from the resource, never from a constant", () => {
    const { state, mode } = scene({ hp: 50 });
    const big = evaluate(state, mode, {
      resource: potion({ effect: { type: "heal", amount: 37 } }),
    });
    expect(big).toEqual({ ok: true, effect: { type: "heal", amount: 37 } });
  });

  it("refuses automatic and quick mode — select_target alone is NOT manual control", () => {
    // turnResolver sets phase 'select_target' on auto turns too, so the phase can never
    // establish manual control on its own. This is the check that enforces it.
    for (const mode of ["auto", "quick"] as BattleMode[]) {
      const { state } = scene({ hp: 50 });
      expect(evaluate(state, mode)).toEqual({ ok: false, reason: "not_manual_mode" });
    }
  });

  it("refuses outside the target-selection phase", () => {
    const { state, mode } = scene({ hp: 50 });
    expect(evaluate({ ...state, phase: "placement" }, mode))
      .toEqual({ ok: false, reason: "not_awaiting_manual_action" });
    expect(evaluate({ ...state, phase: "end" }, mode))
      .toEqual({ ok: false, reason: "not_awaiting_manual_action" });
  });

  it("refuses a unit that is not the head of the round queue", () => {
    const { state, mode } = scene({ hp: 50 });
    expect(evaluate({ ...state, roundQueue: ["foe", "hero"] }, mode))
      .toEqual({ ok: false, reason: "not_active_unit" });
  });

  it("refuses an enemy unit and an unknown unit", () => {
    const { state, mode } = scene({ hp: 50 });
    expect(evaluate({ ...state, roundQueue: ["foe"] }, mode, { unitId: "foe" }))
      .toEqual({ ok: false, reason: "not_active_unit" });
    expect(evaluate({ ...state, roundQueue: ["ghost"] }, mode, { unitId: "ghost" }))
      .toEqual({ ok: false, reason: "not_active_unit" });
  });

  it("refuses a dead actor", () => {
    const { state, mode } = scene({ dead: true });
    expect(evaluate(state, mode)).toEqual({ ok: false, reason: "unit_dead" });
  });

  it("refuses a bench-deployed actor", () => {
    const hero = makeUnit({ id: "hero", side: "player", hp: 50, maxHp: 100 });
    const state = makeBattleStateFromUnits({ bench: [{ unit: hero, slot: 0 }], benchSlotCount: 1 });
    expect(evaluate({ ...state, phase: "select_target", roundQueue: ["hero"] }, "manual"))
      .toEqual({ ok: false, reason: "unit_not_on_field" });
  });

  it("refuses a missing or mismatched instance", () => {
    const { state, mode } = scene({ hp: 50 });
    expect(evaluate(state, mode, { resource: null }))
      .toEqual({ ok: false, reason: "instance_mismatch" });
    expect(evaluate(state, mode, { instanceId: "i_other" }))
      .toEqual({ ok: false, reason: "instance_mismatch" });
  });

  it("refuses an already-consumed item", () => {
    const { state, mode } = scene({ hp: 50 });
    expect(evaluate(state, mode, { alreadyConsumed: true }))
      .toEqual({ ok: false, reason: "already_consumed" });
  });

  it("refuses an unsupported effect and a non-positive amount", () => {
    const { state, mode } = scene({ hp: 50 });
    expect(evaluate(state, mode, {
      resource: potion({ effect: { type: "permanent_stat_boost", stat: "hp", amount: 1 } }),
    })).toEqual({ ok: false, reason: "unsupported_effect" });
    expect(evaluate(state, mode, { resource: potion({ effect: { type: "heal", amount: 0 } }) }))
      .toEqual({ ok: false, reason: "invalid_amount" });
  });

  it("refuses a full-health actor rather than silently spending the item", () => {
    const { state, mode } = scene({ hp: 100 });
    expect(evaluate(state, mode)).toEqual({ ok: false, reason: "unit_full_hp" });
  });
});

describe("applyBattleItemUse", () => {
  const apply = (state: BattleState, mode: BattleMode, over: Record<string, unknown> = {}) =>
    applyBattleItemUse({
      state, mode, unitId: "hero", instanceId: "i_potion",
      resource: potion(), alreadyConsumed: false,
      target: null, selectedInstanceId: null, ...over,
    });

  it("heals only its owner and reports the actual restoration", () => {
    const { state, mode } = scene({ hp: 50 });
    const result = apply(state, mode);
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);

    expect(result.result.kind).toBe("heal");
    expect(result.result.restoredHp).toBe(10);
    expect(result.result.state.units.get("hero")!.hp).toBe(60);
    // The enemy standing on the field is untouched — the item targets its owner and no one else.
    expect(result.result.state.units.get("foe")!.hp).toBe(state.units.get("foe")!.hp);
  });

  it("clamps to missing HP rather than overhealing", () => {
    const { state, mode } = scene({ hp: 97 });
    const result = apply(state, mode);
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);

    expect(result.result.restoredHp).toBe(3);
    expect(result.result.state.units.get("hero")!.hp).toBe(100);
  });

  it("emits one item_heal event naming the item and the applied amount", () => {
    const { state, mode } = scene({ hp: 50 });
    const result = apply(state, mode);
    if (!result.ok) throw new Error(`unexpected failure: ${result.reason}`);

    expect(result.result.events).toEqual([{
      type: "item_heal", unitId: "hero", unitName: "Test Unit",
      itemName: "Small Healing Potion", amount: 10,
    }]);
  });

  it("refuses a target on a self item", () => {
    const { state, mode } = scene({ hp: 50 });
    expect(apply(state, mode, { target: { side: "player", row: 1, col: 1 } }))
      .toEqual({ ok: false, reason: "invalid_target" });
  });

  it("changes nothing at all on failure", () => {
    const { state, mode } = scene({ hp: 50 });
    const result = apply(state, "auto");

    expect(result).toEqual({ ok: false, reason: "not_manual_mode" });
    // The caller still holds the untouched state — no HP, no queue, no phase change.
    expect(state.units.get("hero")!.hp).toBe(50);
    expect(state.roundQueue).toEqual(["hero", "foe"]);
    expect(state.phase).toBe("select_target");
  });

  it("does not mutate the input state", () => {
    const { state, mode } = scene({ hp: 50 });
    const result = apply(state, mode);
    if (!result.ok) throw new Error("expected success");

    expect(state.units.get("hero")!.hp).toBe(50);
    expect(result.result.state).not.toBe(state);
  });
});
