import { describe, it, expect } from "vitest";
import { buildRosterCampSnapshot } from "../../src/core/rosterCampSnapshot";
import { getRosterPartyStatus } from "../../src/progression/rosterCamp";
import { PLAYER_UNITS } from "../../src/data/units";
import type { RosterState, PlayerUnitState } from "../../src/progression/rosterState";

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

function fullRoster(overrides: Record<string, Partial<PlayerUnitState>> = {}): RosterState {
  const units: Record<string, PlayerUnitState> = {};
  for (const bp of PLAYER_UNITS) {
    units[bp.templateId] = unit(overrides[bp.templateId] ?? {});
  }
  return { units };
}

describe("buildRosterCampSnapshot", () => {
  it("preserves PLAYER_UNITS display order in units", () => {
    const snapshot = buildRosterCampSnapshot(fullRoster());
    expect(snapshot.units.map(u => u.templateId)).toEqual(PLAYER_UNITS.map(bp => bp.templateId));
  });

  it("derives campUnitIds from the ordered units list", () => {
    const firstId = PLAYER_UNITS[0].templateId;
    const lastId = PLAYER_UNITS[PLAYER_UNITS.length - 1].templateId;
    const roster = fullRoster({
      [firstId]: { isInCamp: true },
      [lastId]: { isInCamp: true },
    });
    const snapshot = buildRosterCampSnapshot(roster);
    expect(snapshot.campUnitIds).toEqual([firstId, lastId]);
  });

  it("a roster unit missing from roster.units is presented as not alive and not in camp", () => {
    const roster: RosterState = { units: {} };
    const snapshot = buildRosterCampSnapshot(roster);
    expect(snapshot.units.every(u => u.isAlive === false && u.inCamp === false)).toBe(true);
  });

  it("forwards getRosterPartyStatus's result unchanged, without recomputing it", () => {
    const firstId = PLAYER_UNITS[0].templateId;
    const roster = fullRoster({ [firstId]: { isInCamp: true } });
    const snapshot = buildRosterCampSnapshot(roster);
    const domainStatus = getRosterPartyStatus(roster);
    expect(snapshot.activeLivingUnitCount).toBe(domainStatus.activeLivingUnitCount);
    expect(snapshot.canStartBattle).toBe(domainStatus.canStartBattle);
  });

  it("campaign and debug snapshots derive the same activeLivingUnitCount from equivalent rosters", () => {
    const roster1 = fullRoster();
    const roster2: RosterState = { units: { ...roster1.units } };
    expect(buildRosterCampSnapshot(roster1).activeLivingUnitCount)
      .toBe(buildRosterCampSnapshot(roster2).activeLivingUnitCount);
  });
});
