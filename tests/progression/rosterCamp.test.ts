import { describe, it, expect } from "vitest";
import type { RosterState, PlayerUnitState } from "../../src/progression/rosterState";
import {
  isActiveLivingUnit,
  getRosterPartyStatus,
  toggleUnitCampStatus,
} from "../../src/progression/rosterCamp";

function unit(overrides: Partial<PlayerUnitState> = {}): PlayerUnitState {
  return {
    level: 1,
    isInCamp: false,
    lastPlacement: null,
    permanentBonuses: {},
    chosenUpgrades: {},
    lifeState: "alive",
    currentHp: null,
    ...overrides,
  };
}

function roster(units: Record<string, PlayerUnitState>): RosterState {
  return { units };
}

describe("isActiveLivingUnit", () => {
  it("is true for a living, non-camp unit", () => {
    expect(isActiveLivingUnit(unit())).toBe(true);
  });

  it("is false for a camped living unit", () => {
    expect(isActiveLivingUnit(unit({ isInCamp: true }))).toBe(false);
  });

  it("is false for a dead non-camp unit", () => {
    expect(isActiveLivingUnit(unit({ lifeState: "dead", currentHp: 0 }))).toBe(false);
  });
});

describe("getRosterPartyStatus", () => {
  it("excludes dead units and camped units from activeLivingUnitCount", () => {
    const r = roster({
      a: unit(),
      b: unit({ isInCamp: true }),
      c: unit({ lifeState: "dead", currentHp: 0 }),
    });
    expect(getRosterPartyStatus(r).activeLivingUnitCount).toBe(1);
  });

  it("canStartBattle is false at zero active living units", () => {
    const r = roster({ a: unit({ isInCamp: true }) });
    const status = getRosterPartyStatus(r);
    expect(status.activeLivingUnitCount).toBe(0);
    expect(status.canStartBattle).toBe(false);
  });

  it("canStartBattle is true for every count from 1 through 9", () => {
    for (let n = 1; n <= 9; n++) {
      const units: Record<string, PlayerUnitState> = {};
      for (let i = 0; i < n; i++) units[`u${i}`] = unit();
      expect(getRosterPartyStatus(roster(units)).canStartBattle).toBe(true);
    }
  });

  it("canStartBattle is false above nine active living units", () => {
    const units: Record<string, PlayerUnitState> = {};
    for (let i = 0; i < 10; i++) units[`u${i}`] = unit();
    expect(getRosterPartyStatus(roster(units)).canStartBattle).toBe(false);
  });
});

describe("toggleUnitCampStatus", () => {
  it("moves a living unit out of camp", () => {
    const r = roster({ a: unit({ isInCamp: true }), b: unit() });
    const result = toggleUnitCampStatus(r, "a");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextRoster.units.a.isInCamp).toBe(false);
    }
  });

  it("moves a camped unit back to active", () => {
    const r = roster({ a: unit({ isInCamp: true }), b: unit() });
    const result = toggleUnitCampStatus(r, "a");
    expect(result.ok).toBe(true);
  });

  it("rejects removal of the last active living unit", () => {
    const r = roster({ a: unit(), b: unit({ isInCamp: true }) });
    const result = toggleUnitCampStatus(r, "a");
    expect(result).toEqual({ ok: false, reason: "last_active_living_unit" });
  });

  it("a dead non-camp unit does not satisfy the active-living invariant, so it can't cover for the last living unit", () => {
    const r = roster({ a: unit(), b: unit({ lifeState: "dead", currentHp: 0 }) });
    const result = toggleUnitCampStatus(r, "a");
    expect(result).toEqual({ ok: false, reason: "last_active_living_unit" });
  });

  it("allows a dead unit to move into camp freely", () => {
    const r = roster({ a: unit({ lifeState: "dead", currentHp: 0 }), b: unit() });
    const result = toggleUnitCampStatus(r, "a");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nextRoster.units.a.isInCamp).toBe(true);
  });

  it("allows a dead camped unit to move out of camp freely", () => {
    const r = roster({ a: unit({ lifeState: "dead", currentHp: 0, isInCamp: true }), b: unit() });
    const result = toggleUnitCampStatus(r, "a");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nextRoster.units.a.isInCamp).toBe(false);
  });

  it("returns unit_not_found for a missing templateId", () => {
    const r = roster({ a: unit() });
    const result = toggleUnitCampStatus(r, "missing");
    expect(result).toEqual({ ok: false, reason: "unit_not_found" });
  });

  it("on success, preserves references to unchanged unit records", () => {
    const bUnit = unit({ isInCamp: true });
    const r = roster({ a: unit(), b: bUnit, c: unit() });
    const result = toggleUnitCampStatus(r, "c");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextRoster.units.b).toBe(bUnit);
      expect(result.nextRoster.units.a).toBe(r.units.a);
    }
  });

  it("on failure, does not mutate or clone the input roster", () => {
    const r = roster({ a: unit(), b: unit({ isInCamp: true }) });
    const before = r.units.a;
    const result = toggleUnitCampStatus(r, "a");
    expect(result.ok).toBe(false);
    expect(r.units.a).toBe(before);
  });
});
