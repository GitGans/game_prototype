import { describe, it, expect } from "vitest";
import {
  applyPermanentStatBoost,
  applyPermanentStatBoostToRoster,
} from "../../src/progression/consumableStatBoost";
import type { PlayerUnitState, RosterState } from "../../src/progression/rosterState";

function unit(overrides: Partial<PlayerUnitState> = {}): PlayerUnitState {
  return {
    level: 3,
    isInCamp: false,
    lastPlacement: { row: 1, col: 2 },
    permanentBonuses: {},
    chosenUpgrades: { 5: "opt_a" as never },
    lifeState: "alive",
    currentHp: null,
    ...overrides,
  };
}

describe("applyPermanentStatBoost — HP", () => {
  it("heals a wounded unit by the same amount it raises max HP", () => {
    const result = applyPermanentStatBoost({
      unit: unit({ currentHp: 7 }), stat: "hp", amount: 5, oldMaxHp: 20, oldCurrentHp: 7,
    });
    if (!result.ok) throw new Error(result.reason);

    // 7/20 → 12/25: the bonus and the heal are the same number, and neither is capped away.
    expect(result.nextUnit.permanentBonuses).toEqual({ hp: 5 });
    expect(result.nextUnit.currentHp).toBe(12);
  });

  it("keeps a full unit stored as null rather than a number equal to the new max", () => {
    const result = applyPermanentStatBoost({
      unit: unit({ currentHp: null }), stat: "hp", amount: 12, oldMaxHp: 30, oldCurrentHp: 30,
    });
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextUnit.permanentBonuses).toEqual({ hp: 12 });
    expect(result.nextUnit.currentHp).toBeNull();
  });

  it("stores null when a wounded unit is healed exactly to the new max", () => {
    const result = applyPermanentStatBoost({
      unit: unit({ currentHp: 20 }), stat: "hp", amount: 5, oldMaxHp: 20, oldCurrentHp: 20,
    });
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextUnit.currentHp).toBeNull();
  });

  it("applies +12 the same way it applies +5 — no amount is special-cased", () => {
    const result = applyPermanentStatBoost({
      unit: unit({ currentHp: 4 }), stat: "hp", amount: 12, oldMaxHp: 18, oldCurrentHp: 4,
    });
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextUnit.permanentBonuses).toEqual({ hp: 12 });
    expect(result.nextUnit.currentHp).toBe(16);
  });
});

describe("applyPermanentStatBoost — non-HP", () => {
  it("leaves current HP untouched", () => {
    const result = applyPermanentStatBoost({
      unit: unit({ currentHp: 7 }), stat: "physicalStrength", amount: 2,
      oldMaxHp: 20, oldCurrentHp: 7,
    });
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextUnit.permanentBonuses).toEqual({ physicalStrength: 2 });
    expect(result.nextUnit.currentHp).toBe(7);
  });

  it("leaves a null current HP null", () => {
    const result = applyPermanentStatBoost({
      unit: unit({ currentHp: null }), stat: "block", amount: 3, oldMaxHp: 20, oldCurrentHp: 20,
    });
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextUnit.currentHp).toBeNull();
  });
});

describe("applyPermanentStatBoost — validation and preservation", () => {
  it("rejects a dead unit before applying anything", () => {
    const dead = unit({ lifeState: "dead", currentHp: 0 });

    expect(applyPermanentStatBoost({ unit: dead, stat: "hp", amount: 5, oldMaxHp: 20, oldCurrentHp: 20 }))
      .toEqual({ ok: false, reason: "unit_dead" });
  });

  it.each([0, -3, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects a non-positive or non-finite amount (%s)",
    (amount) => {
      expect(applyPermanentStatBoost({ unit: unit(), stat: "hp", amount, oldMaxHp: 20, oldCurrentHp: 20 }))
        .toEqual({ ok: false, reason: "invalid_amount" });
    },
  );

  it("rejects arithmetic that cannot produce a finite result", () => {
    const saturated = unit({ permanentBonuses: { hp: Number.MAX_VALUE } });

    expect(applyPermanentStatBoost({
      unit: saturated, stat: "hp", amount: Number.MAX_VALUE, oldMaxHp: 20, oldCurrentHp: 20,
    })).toEqual({ ok: false, reason: "invalid_result" });
  });

  it("stacks onto an existing bonus for the same stat", () => {
    const result = applyPermanentStatBoost({
      unit: unit({ permanentBonuses: { hp: 5, block: 1 } }),
      stat: "hp", amount: 5, oldMaxHp: 25, oldCurrentHp: 25,
    });
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextUnit.permanentBonuses).toEqual({ hp: 10, block: 1 });
  });

  it("preserves every other field and never mutates the input", () => {
    const original = unit({ currentHp: 7 });
    const snapshot = JSON.parse(JSON.stringify(original));

    const result = applyPermanentStatBoost({
      unit: original, stat: "hp", amount: 5, oldMaxHp: 20, oldCurrentHp: 7,
    });
    if (!result.ok) throw new Error(result.reason);

    expect(original).toEqual(snapshot);
    expect(result.nextUnit.level).toBe(original.level);
    expect(result.nextUnit.isInCamp).toBe(original.isInCamp);
    expect(result.nextUnit.lastPlacement).toEqual(original.lastPlacement);
    expect(result.nextUnit.chosenUpgrades).toEqual(original.chosenUpgrades);
    expect(result.nextUnit.lifeState).toBe("alive");
  });
});

describe("applyPermanentStatBoostToRoster", () => {
  const roster: RosterState = { units: { warrior: unit({ currentHp: 7 }), healer: unit() } };

  it("replaces only the boosted unit", () => {
    const result = applyPermanentStatBoostToRoster(roster, "warrior", {
      stat: "hp", amount: 5, oldMaxHp: 20, oldCurrentHp: 7,
    });
    if (!result.ok) throw new Error(result.reason);

    expect(result.nextRoster.units.warrior.permanentBonuses).toEqual({ hp: 5 });
    expect(result.nextRoster.units.healer).toBe(roster.units.healer);
    expect(roster.units.warrior.permanentBonuses).toEqual({});
  });

  it("reports a missing unit", () => {
    expect(applyPermanentStatBoostToRoster(roster, "ghost", {
      stat: "hp", amount: 5, oldMaxHp: 20, oldCurrentHp: 20,
    })).toEqual({ ok: false, reason: "unit_not_found" });
  });
});
