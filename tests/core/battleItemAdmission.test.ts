import { describe, expect, it } from "vitest";
import { resolveTransition } from "../../src/core/phaseTransitionResolver";
import type { BattleActionBarEntry, PhaseAction } from "../../src/core/phases";
import { makeBattlePhase } from "./helpers/phaseFixtures";

/**
 * Pure admission of item actions from committed phase data only. Which items need a target is
 * the projected `targetMode` — the resolver never interprets an effect type.
 */

const metadata = { mapCleared: false };
const CORPSE = { side: "player" as const, row: 1 as const, col: 0 as const };
const OTHER = { side: "player" as const, row: 0 as const, col: 1 as const };

const scroll: BattleActionBarEntry = {
  kind: "item", unitId: "p1", instanceId: "scroll", label: "Small Resurrection Scroll",
  sprite: null, effect: { type: "revive", hpPercent: 30 }, targetMode: "dead_ally",
  enabled: true, disabledReason: null,
};
const potion: BattleActionBarEntry = {
  kind: "item", unitId: "p1", instanceId: "potion", label: "Small Healing Potion",
  sprite: null, effect: { type: "heal", amount: 10 }, targetMode: "self",
  enabled: true, disabledReason: null,
};

function phase(over: Parameters<typeof makeBattlePhase>[0] = {}) {
  return makeBattlePhase({ battlePhase: "select_target", activeUnitActions: [scroll], ...over });
}

const accepts = (p: ReturnType<typeof phase>, action: PhaseAction) =>
  resolveTransition(p, action, metadata) === p;

describe("battle_select_item admission", () => {
  it("accepts an enabled targeted item under manual control", () => {
    expect(accepts(phase(), { type: "battle_select_item", unitId: "p1", instanceId: "scroll" })).toBe(true);
  });

  it("rejects a self item, a disabled or absent item, and auto mode", () => {
    expect(accepts(phase({ activeUnitActions: [potion] }),
      { type: "battle_select_item", unitId: "p1", instanceId: "potion" })).toBe(false);
    expect(accepts(phase({ activeUnitActions: [{ ...scroll, enabled: false, disabledReason: "no_valid_targets" }] }),
      { type: "battle_select_item", unitId: "p1", instanceId: "scroll" })).toBe(false);
    expect(accepts(phase({ activeUnitActions: [] }),
      { type: "battle_select_item", unitId: "p1", instanceId: "scroll" })).toBe(false);
    expect(accepts(phase({ battleMode: "auto" }),
      { type: "battle_select_item", unitId: "p1", instanceId: "scroll" })).toBe(false);
  });
});

describe("battle_use_item admission", () => {
  const selected = () => phase({ selectedUsableInstanceId: "scroll", validTargets: [CORPSE] });

  it("accepts a targeted item only as the committed selection on a committed valid cell", () => {
    expect(accepts(selected(),
      { type: "battle_use_item", unitId: "p1", instanceId: "scroll", target: CORPSE })).toBe(true);
    expect(accepts(phase({ validTargets: [CORPSE] }),
      { type: "battle_use_item", unitId: "p1", instanceId: "scroll", target: CORPSE })).toBe(false);
    expect(accepts(selected(),
      { type: "battle_use_item", unitId: "p1", instanceId: "scroll", target: null })).toBe(false);
    expect(accepts(selected(),
      { type: "battle_use_item", unitId: "p1", instanceId: "scroll", target: OTHER })).toBe(false);
  });

  it("accepts a self item only with target: null", () => {
    const p = phase({ activeUnitActions: [potion] });
    expect(accepts(p, { type: "battle_use_item", unitId: "p1", instanceId: "potion", target: null })).toBe(true);
    expect(accepts(p, { type: "battle_use_item", unitId: "p1", instanceId: "potion", target: CORPSE })).toBe(false);
  });
});

describe("battle_use_skill while an item is selected", () => {
  it("is rejected: the committed targets belong to the item", () => {
    const action: PhaseAction = { type: "battle_use_skill", unitId: "p1", target: CORPSE };
    expect(accepts(phase({ selectedUsableInstanceId: "scroll", validTargets: [CORPSE] }), action)).toBe(false);
    expect(accepts(phase(), action)).toBe(true);
  });
});
