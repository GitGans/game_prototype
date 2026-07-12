import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../../src/core/GameState";
import type { DebugBattleState } from "../../src/core/DebugBattleState";

const debugState = (): DebugBattleState => ({
  session: {
    roster: { units: {} },
    inventory: { containers: {}, instances: {} },
  },
  initialConfig: { level: 1, startingItems: [], initialCampUnitIds: [] },
});

describe("GameState.requireDebugState", () => {
  beforeEach(() => {
    GameState.clearDebugState();
  });

  it("throws when debug state is absent", () => {
    expect(() => GameState.requireDebugState()).toThrow("Debug state is not initialized");
  });

  it("returns the exact initialized DebugBattleState", () => {
    const state = debugState();
    GameState.setDebugState(state);
    expect(GameState.requireDebugState()).toBe(state);
  });

  it("throws again after clearDebugState()", () => {
    GameState.setDebugState(debugState());
    GameState.clearDebugState();
    expect(() => GameState.requireDebugState()).toThrow();
  });
});
