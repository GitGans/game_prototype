import { describe, it, expect, beforeEach } from "vitest";
import type { BattleMode, BattleState } from "../../src/battle/types";
import type { ReadonlyItemUseEffect } from "../../src/shared/itemTypes";
import {
  computeReviveHp,
  computeReviveHpFromPercent,
  reviveUnitInBattle,
  reviveUnitInBattleByPercent,
} from "../../src/battle/revive";
import { evaluateBattleItemUse, type BattleItemResource } from "../../src/battle/itemUsability";
import {
  applyBattleItemUse,
  cancelItemTargeting,
  selectBattleItem,
} from "../../src/battle/itemUse";
import { resolveBattleItemPreview } from "../../src/battle/itemPreview";
import { chargeActiveTurn, createTurnContext } from "../../src/battle/turnResolver";
import { resolveBattleTransition } from "../../src/battle/battleTransition";
import { killUnit } from "../../src/battle/lifeState";
import { buildOccupancy } from "../../src/battle/occupancy";
import { REVIVE_HP_PERCENT_LEVELS } from "../../src/data/skills";
import { coord } from "./helpers/coords";
import { makeUnit, resetUnitIdCounter } from "./helpers/units";
import { makeBattleStateFromUnits } from "./helpers/battleState";
import { fixedRng } from "./helpers/rng";

/**
 * Equipped resurrection: shared percentage primitives, field-only dead-ally targeting, selection,
 * execution and the preview computation. Strength is the resource's authored `hpPercent` — never
 * a skill level, and never a constant in the code under test.
 */

/** Every authored revive skill level, read from the table itself. */
const REVIVE_LEVELS = Object.keys(REVIVE_HP_PERCENT_LEVELS).map(Number) as (1 | 2 | 3)[];

const REVIVE_30: ReadonlyItemUseEffect = { type: "revive", hpPercent: 30 };
const SCROLL = "i_scroll";

function scroll(overrides: Partial<BattleItemResource> = {}): BattleItemResource {
  return { instanceId: SCROLL, name: "Small Resurrection Scroll", effect: REVIVE_30, ...overrides };
}

const HERO_CELL   = coord("player", 0, 0);
const BUDDY_CELL  = coord("player", 0, 1);
const FALLEN_CELL = coord("player", 1, 0);
const FOE_CELL    = coord("enemy", 1, 0);
const DEAD_FOE_CELL = coord("enemy", 0, 0);
const EMPTY_PLAYER_CELL = coord("player", 1, 2);

function kill(state: BattleState, id: string): BattleState {
  const units = new Map(state.units);
  units.set(id, killUnit(state.units.get(id)!));
  return { ...state, units, occupancy: buildOccupancy(units, state.deployments) };
}

/**
 * hero (active, alive) · buddy (living ally) · fallen (dead ally on the field, maxHp 70) ·
 * benched (dead ally on the bench) · foe (living enemy) · deadFoe (enemy corpse).
 */
function scene(input: { withFallen?: boolean } = {}) {
  const withFallen = input.withFallen ?? true;
  const hero    = makeUnit({ id: "hero", name: "Hero", side: "player", hp: 40, maxHp: 100 });
  const buddy   = makeUnit({ id: "buddy", name: "Buddy", side: "player" });
  const fallen  = makeUnit({ id: "fallen", name: "Fallen", side: "player", maxHp: 70, hp: 70 });
  const benched = makeUnit({ id: "benched", name: "Benched", side: "player" });
  const foe     = makeUnit({ id: "foe", name: "Foe", side: "enemy" });
  const deadFoe = makeUnit({ id: "deadFoe", name: "Dead Foe", side: "enemy" });

  let state = makeBattleStateFromUnits({
    field: [
      { unit: hero, anchor: HERO_CELL },
      { unit: buddy, anchor: BUDDY_CELL },
      { unit: fallen, anchor: FALLEN_CELL },
      { unit: foe, anchor: FOE_CELL },
      { unit: deadFoe, anchor: DEAD_FOE_CELL },
    ],
    bench: [{ unit: benched, slot: 0 }],
    benchSlotCount: 1,
  });
  state = kill(kill(state, "benched"), "deadFoe");
  if (withFallen) state = kill(state, "fallen");
  return {
    state: { ...state, roundQueue: ["hero", "foe", "buddy"] } as BattleState,
    mode: "manual" as BattleMode,
  };
}

const base = (state: BattleState, mode: BattleMode, over: Record<string, unknown> = {}) => ({
  state, mode, unitId: "hero", instanceId: SCROLL,
  resource: scroll(), alreadyConsumed: false, ...over,
});

beforeEach(resetUnitIdCounter);

// ─── Percentage primitives ──────────────────────────────────────────────────

describe("computeReviveHpFromPercent", () => {
  it("rounds up and never restores less than 1 HP", () => {
    expect(computeReviveHpFromPercent({ maxHp: 100 }, 30)).toBe(30);
    expect(computeReviveHpFromPercent({ maxHp: 7 }, 30)).toBe(3);
    expect(computeReviveHpFromPercent({ maxHp: 1 }, 1)).toBe(1);
    expect(computeReviveHpFromPercent({ maxHp: 0 }, 30)).toBe(1);
  });

  it("is what every skill level resolves to — skills and items share one formula", () => {
    for (const level of REVIVE_LEVELS) {
      for (const maxHp of [1, 7, 70, 100, 333]) {
        expect(computeReviveHp({ maxHp }, { level }))
          .toBe(computeReviveHpFromPercent({ maxHp }, REVIVE_HP_PERCENT_LEVELS[level]!));
      }
    }
  });
});

describe("reviveUnitInBattleByPercent", () => {
  it("is what the skill wrapper delegates to", () => {
    const { state } = scene();
    for (const level of REVIVE_LEVELS) {
      const bySkill = reviveUnitInBattle(state, "fallen", { level })!;
      const byPercent = reviveUnitInBattleByPercent(state, "fallen", REVIVE_HP_PERCENT_LEVELS[level]!)!;
      expect(bySkill.hpRestored).toBe(byPercent.hpRestored);
      expect(bySkill.state.units.get("fallen")).toEqual(byPercent.state.units.get("fallen"));
    }
  });

  it("revives a dead field unit, rebuilds occupancy and reuses the round queue by reference", () => {
    const { state } = scene();
    const result = reviveUnitInBattleByPercent(state, "fallen", 30)!;

    expect(result.hpRestored).toBe(21);                                   // ceil(70 × 30%)
    expect(result.state.units.get("fallen")).toMatchObject({ lifeState: "alive", hp: 21 });
    expect(result.state.occupancy.cellToUnitId.size).toBeGreaterThan(state.occupancy.cellToUnitId.size);
    expect(result.state.roundQueue).toBe(state.roundQueue);
  });

  it("refuses living, bench and missing units", () => {
    const { state } = scene();
    expect(reviveUnitInBattleByPercent(state, "buddy", 30)).toBeNull();
    expect(reviveUnitInBattleByPercent(state, "benched", 30)).toBeNull();
    expect(reviveUnitInBattleByPercent(state, "ghost", 30)).toBeNull();
  });
});

// ─── Eligibility and targeting ──────────────────────────────────────────────

describe("evaluateBattleItemUse — revive", () => {
  it("targets exactly the dead allied FIELD bodies: never living allies, enemies or the bench", () => {
    const { state, mode } = scene();
    const result = evaluateBattleItemUse(base(state, mode));
    if (!result.ok || result.effect.type !== "revive") throw new Error("expected a revive");

    expect(result.effect.hpPercent).toBe(30);
    expect(result.effect.targetCells).toEqual([FALLEN_CELL]);
  });

  it("is refused with no_valid_targets when no ally has fallen on the field", () => {
    const { state, mode } = scene({ withFallen: false });
    expect(evaluateBattleItemUse(base(state, mode)))
      .toEqual({ ok: false, reason: "no_valid_targets" });
  });

  it("is refused for an invalid runtime percent", () => {
    const { state, mode } = scene();
    for (const hpPercent of [0, -1, 101, Number.NaN]) {
      expect(evaluateBattleItemUse(base(state, mode, {
        resource: scroll({ effect: { type: "revive", hpPercent } }),
      }))).toEqual({ ok: false, reason: "invalid_amount" });
    }
  });

  it("is refused for a dead owner and outside manual mode", () => {
    const { state, mode } = scene();
    expect(evaluateBattleItemUse(base(kill(state, "hero"), mode)))
      .toEqual({ ok: false, reason: "unit_dead" });
    expect(evaluateBattleItemUse(base(state, "auto")))
      .toEqual({ ok: false, reason: "not_manual_mode" });
  });
});

// ─── Selection and cancellation ─────────────────────────────────────────────

describe("selectBattleItem", () => {
  it("puts the corpse cells into validTargets, clears the preview and returns the id separately", () => {
    const { state, mode } = scene();
    const withPreview = { ...state, previewTargetCoord: FOE_CELL };
    const result = selectBattleItem(base(withPreview, mode));
    if (!result.ok) throw new Error(`unexpected ${result.reason}`);

    expect(result.selectedInstanceId).toBe(SCROLL);
    expect(result.state.validTargets).toEqual([FALLEN_CELL]);
    expect(result.state.previewTargetCoord).toBeNull();
    // Selection touches no unit and no queue, and BattleState carries no item identity.
    expect(result.state.units).toBe(state.units);
    expect(result.state.roundQueue).toBe(state.roundQueue);
    expect(Object.keys(result.state)).not.toContain("selectedUsableInstanceId");
  });

  it("refuses a self item — it has nothing to select", () => {
    const { state, mode } = scene();
    expect(selectBattleItem(base(state, mode, {
      resource: scroll({ effect: { type: "heal", amount: 10 } }),
    }))).toEqual({ ok: false, reason: "invalid_target" });
  });

  it("refuses with no_valid_targets, never selecting an empty targeting mode", () => {
    const { state, mode } = scene({ withFallen: false });
    expect(selectBattleItem(base(state, mode))).toEqual({ ok: false, reason: "no_valid_targets" });
  });
});

describe("cancelItemTargeting", () => {
  it("drops the target cells and the preview, and nothing else", () => {
    const { state } = scene();
    const targeting = { ...state, validTargets: [FALLEN_CELL], previewTargetCoord: FALLEN_CELL };
    const cancelled = cancelItemTargeting(targeting);

    expect(cancelled.validTargets).toEqual([]);
    expect(cancelled.previewTargetCoord).toBeNull();
    expect(cancelled.units).toBe(state.units);
    expect(cancelled.roundQueue).toBe(state.roundQueue);
  });
});

// ─── Execution ──────────────────────────────────────────────────────────────

describe("applyBattleItemUse — revive", () => {
  const apply = (state: BattleState, mode: BattleMode, over: Record<string, unknown> = {}) =>
    applyBattleItemUse({
      ...base(state, mode), target: FALLEN_CELL, selectedInstanceId: SCROLL, ...over,
    });

  it("revives the selected corpse with the authored share of max HP", () => {
    const { state, mode } = scene();
    const result = apply(state, mode);
    if (!result.ok || result.result.kind !== "revive") throw new Error("expected a revive");

    const expected = computeReviveHpFromPercent({ maxHp: 70 }, 30);
    expect(result.result.targetUnitId).toBe("fallen");
    expect(result.result.restoredHp).toBe(expected);
    expect(result.result.state.units.get("fallen")).toMatchObject({ lifeState: "alive", hp: expected });
  });

  it("leaves the current round queue untouched — the same reference", () => {
    const { state, mode } = scene();
    const result = apply(state, mode);
    if (!result.ok) throw new Error("expected success");
    expect(result.result.state.roundQueue).toBe(state.roundQueue);
    expect(result.result.state.roundQueue).not.toContain("fallen");
  });

  it("emits exactly one item_revive event naming the item, the owner and the target", () => {
    const { state, mode } = scene();
    const result = apply(state, mode);
    if (!result.ok) throw new Error("expected success");
    expect(result.result.events).toEqual([{
      type: "item_revive",
      unitId: "hero", unitName: "Hero",
      targetId: "fallen", targetName: "Fallen",
      itemName: "Small Resurrection Scroll",
      amount: computeReviveHpFromPercent({ maxHp: 70 }, 30),
    }]);
  });

  it("requires the item to be the current selection", () => {
    const { state, mode } = scene();
    expect(apply(state, mode, { selectedInstanceId: null }))
      .toEqual({ ok: false, reason: "item_not_selected" });
    expect(apply(state, mode, { selectedInstanceId: "i_other" }))
      .toEqual({ ok: false, reason: "item_not_selected" });
  });

  it("refuses a missing, living, enemy, empty or stale target", () => {
    const { state, mode } = scene();
    // Stale: the clicked corpse was revived in the meantime, while another ally still lies dead —
    // so the scroll itself remains usable and only the target is wrong.
    const stale = kill(reviveUnitInBattleByPercent(state, "fallen", 30)!.state, "buddy");

    for (const [label, over, s] of [
      ["null", { target: null }, state],
      ["living ally", { target: BUDDY_CELL }, state],
      ["enemy corpse", { target: DEAD_FOE_CELL }, state],
      ["living enemy", { target: FOE_CELL }, state],
      ["empty cell", { target: EMPTY_PLAYER_CELL }, state],
      ["already revived", {}, stale],
    ] as const) {
      expect(apply(s, mode, over), label).toEqual({ ok: false, reason: "invalid_target" });
    }
  });

  it("does not mutate the input state", () => {
    const { state, mode } = scene();
    apply(state, mode);
    expect(state.units.get("fallen")!.lifeState).toBe("dead");
    expect(state.units.get("fallen")!.hp).toBe(0);
  });
});

// ─── Preview computation ────────────────────────────────────────────────────

describe("resolveBattleItemPreview", () => {
  const preview = (state: BattleState, effect: ReadonlyItemUseEffect, targetCoord = FALLEN_CELL) =>
    resolveBattleItemPreview({
      effect, ownerSide: "player", targetCoord,
      units: state.units, deployments: state.deployments,
    });

  it("returns structured data equal to what execution would restore — and no wording", () => {
    const { state } = scene();
    expect(preview(state, REVIVE_30)).toEqual({
      type: "revive",
      targetUnitId: "fallen",
      targetName: "Fallen",
      restoredHp: computeReviveHpFromPercent({ maxHp: 70 }, 30),
      cells: [FALLEN_CELL],
    });
  });

  it("returns null off a corpse, and for a self item", () => {
    const { state } = scene();
    expect(preview(state, REVIVE_30, BUDDY_CELL)).toBeNull();
    expect(preview(state, REVIVE_30, DEAD_FOE_CELL)).toBeNull();
    expect(preview(state, { type: "heal", amount: 10 })).toBeNull();
  });
});

// ─── Explicit no-op signals ─────────────────────────────────────────────────

describe("applied / refused signals", () => {
  it("chargeActiveTurn reports refused only for the already-charged no-op", () => {
    const { state } = scene();
    const first = chargeActiveTurn({ state, context: createTurnContext() });
    expect(first.refused).toBe(false);

    const again = chargeActiveTurn({
      state, context: { chargedThisRound: new Set(["hero"]) },
    });
    expect(again).toMatchObject({ refused: true, charged: false });
    expect(again.state).toBe(state);
  });

  it("select_skill reports applied: false when the switch is refused", () => {
    const { state } = scene();
    const enemyTurn = { ...state, roundQueue: ["foe", "hero"] };
    const refused = resolveBattleTransition({
      state: enemyTurn, context: createTurnContext(), rng: fixedRng(0),
      action: { type: "select_skill", skillIndex: 0 },
    });
    expect(refused.applied).toBe(false);
    expect(refused.state).toBe(enemyTurn);

    const applied = resolveBattleTransition({
      state, context: createTurnContext(), rng: fixedRng(0),
      action: { type: "select_skill", skillIndex: 0 },
    });
    expect(applied.applied).toBe(true);
  });
});
