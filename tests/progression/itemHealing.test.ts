import { describe, it, expect } from "vitest";
import {
  evaluateItemHealing,
  applyItemHealingToRoster,
} from "../../src/progression/itemHealing";
import type { PlayerUnitState, RosterState } from "../../src/progression/rosterState";

function unit(overrides: Partial<PlayerUnitState> = {}): PlayerUnitState {
  return {
    level: 3,
    isInCamp: false,
    lastPlacement: { row: 1, col: 2 },
    permanentBonuses: { hp: 4, physicalStrength: 2 },
    chosenUpgrades: { 5: "opt_a" as never },
    lifeState: "alive",
    currentHp: null,
    ...overrides,
  };
}

function roster(units: Record<string, PlayerUnitState>): RosterState {
  return { units };
}

describe("evaluateItemHealing — the restoration formula", () => {
  it("restores the full amount when enough HP is missing", () => {
    const result = evaluateItemHealing({
      unit: unit({ currentHp: 10 }), amount: 10, maxHp: 30, currentHp: 10,
    });
    if (!result.ok) throw new Error(result.reason);

    expect(result.healing).toEqual({ restoredHp: 10, nextHp: 20 });
  });

  it("clamps restoration to the missing HP rather than overhealing", () => {
    const result = evaluateItemHealing({
      unit: unit({ currentHp: 27 }), amount: 10, maxHp: 30, currentHp: 27,
    });
    if (!result.ok) throw new Error(result.reason);

    expect(result.healing).toEqual({ restoredHp: 3, nextHp: 30 });
  });

  it("accepts any positive amount — strength is authored data, not a fixed set", () => {
    for (const amount of [1, 10, 40, 0.5, 9999]) {
      const result = evaluateItemHealing({
        unit: unit({ currentHp: 1 }), amount, maxHp: 1000, currentHp: 1,
      });
      if (!result.ok) throw new Error(result.reason);
      expect(result.healing.restoredHp).toBe(Math.min(amount, 999));
    }
  });
});

describe("evaluateItemHealing — refusals", () => {
  it("refuses a dead target", () => {
    expect(evaluateItemHealing({
      unit: unit({ lifeState: "dead", currentHp: 0 }), amount: 10, maxHp: 30, currentHp: 0,
    })).toEqual({ ok: false, reason: "unit_dead" });
  });

  it.each([0, -1, NaN, Infinity, -Infinity])("refuses an amount of %s", (amount) => {
    expect(evaluateItemHealing({
      unit: unit({ currentHp: 10 }), amount, maxHp: 30, currentHp: 10,
    })).toEqual({ ok: false, reason: "invalid_amount" });
  });

  it.each([
    ["maxHp", { maxHp: NaN, currentHp: 10 }],
    ["currentHp", { maxHp: 30, currentHp: Infinity }],
  ])("refuses a non-finite %s", (_label, hp) => {
    expect(evaluateItemHealing({ unit: unit(), amount: 10, ...hp }))
      .toEqual({ ok: false, reason: "invalid_result" });
  });

  it("refuses a target at full HP rather than consuming the item for nothing", () => {
    expect(evaluateItemHealing({
      unit: unit({ currentHp: null }), amount: 10, maxHp: 30, currentHp: 30,
    })).toEqual({ ok: false, reason: "unit_full_hp" });
  });

  it("refuses a target above max HP too — there is still nothing to restore", () => {
    expect(evaluateItemHealing({
      unit: unit(), amount: 10, maxHp: 30, currentHp: 31,
    })).toEqual({ ok: false, reason: "unit_full_hp" });
  });
});

describe("applyItemHealingToRoster", () => {
  it("writes only current HP, preserving every other persistent field", () => {
    const before = unit({ currentHp: 10 });
    const result = applyItemHealingToRoster(
      roster({ warrior: before }), "warrior", { amount: 10, maxHp: 30, currentHp: 10 },
    );
    if (!result.ok) throw new Error(result.reason);

    const after = result.nextRoster.units.warrior;
    expect(after.currentHp).toBe(20);
    // A heal is not growth: max-HP sources and permanent bonuses are untouched.
    expect(after.permanentBonuses).toEqual({ hp: 4, physicalStrength: 2 });
    expect(after.level).toBe(3);
    expect(after.chosenUpgrades).toEqual(before.chosenUpgrades);
    expect(after.lifeState).toBe("alive");
    expect(after.isInCamp).toBe(false);
    expect(after.lastPlacement).toEqual({ row: 1, col: 2 });
  });

  it("stores a full result as null, following the PlayerUnitState HP invariant", () => {
    const result = applyItemHealingToRoster(
      roster({ warrior: unit({ currentHp: 27 }) }), "warrior",
      { amount: 10, maxHp: 30, currentHp: 27 },
    );
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextRoster.units.warrior.currentHp).toBeNull();
  });

  it("returns a new roster and mutates neither it nor the other units", () => {
    const other = unit({ currentHp: 5 });
    const before = roster({ warrior: unit({ currentHp: 10 }), healer: other });
    const snapshot = JSON.parse(JSON.stringify(before));

    const result = applyItemHealingToRoster(
      before, "warrior", { amount: 10, maxHp: 30, currentHp: 10 },
    );
    if (!result.ok) throw new Error(result.reason);

    expect(JSON.parse(JSON.stringify(before))).toEqual(snapshot);
    expect(result.nextRoster).not.toBe(before);
    // Untouched units are carried across by reference, not rebuilt.
    expect(result.nextRoster.units.healer).toBe(other);
  });

  it("reports unit_not_found for a missing roster record", () => {
    expect(applyItemHealingToRoster(
      roster({ warrior: unit() }), "ghost", { amount: 10, maxHp: 30, currentHp: 10 },
    )).toEqual({ ok: false, reason: "unit_not_found" });
  });

  it("forwards every evaluation refusal instead of applying a second formula", () => {
    expect(applyItemHealingToRoster(
      roster({ warrior: unit({ currentHp: null }) }), "warrior",
      { amount: 10, maxHp: 30, currentHp: 30 },
    )).toEqual({ ok: false, reason: "unit_full_hp" });

    expect(applyItemHealingToRoster(
      roster({ warrior: unit({ lifeState: "dead", currentHp: 0 }) }), "warrior",
      { amount: 10, maxHp: 30, currentHp: 0 },
    )).toEqual({ ok: false, reason: "unit_dead" });
  });
});
