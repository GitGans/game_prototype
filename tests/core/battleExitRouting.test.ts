import { describe, it, expect } from "vitest";
import { resolveBattleExitRoute } from "../../src/core/battleExitRouting";
import type { DebugBattleState } from "../../src/core/DebugBattleState";

const debugState = (): DebugBattleState => ({
  session: {
    roster: { units: {} },
    inventory: { containers: {}, instances: {} },
  },
  initialConfig: { level: 1, startingItems: [], initialCampUnitIds: [] },
});

describe("resolveBattleExitRoute", () => {
  it("routes to debug when sessionSource is debug and debug state exists", () => {
    const state = debugState();
    expect(resolveBattleExitRoute("debug", state)).toEqual({ source: "debug", debugState: state });
  });

  it("routes to campaign when sessionSource is campaign, regardless of debug state", () => {
    expect(resolveBattleExitRoute("campaign", null)).toEqual({ source: "campaign" });
    expect(resolveBattleExitRoute("campaign", debugState())).toEqual({ source: "campaign" });
  });

  it("throws instead of falling back to campaign when sessionSource is debug but debug state is missing", () => {
    expect(() => resolveBattleExitRoute("debug", null)).toThrow("Debug state is not initialized");
  });
});
