import { describe, expect, it } from "vitest";
import { wouldMapBeClearedAfterDefeatingMob } from "../../src/world/mapCompletion";
import type { SubMapDefinition, SubMapState } from "../../src/world/types";

const twoMobMap: SubMapDefinition = {
  id: "test_map",
  startPos: { x: 0, y: 0 },
  layout: [
    [{ type: "mob", id: "mob_a" }, { type: "mob", id: "mob_b" }],
  ],
  entities: {
    mob: {
      mob_a: { enemyGroupId: "test_enemies" },
      mob_b: { enemyGroupId: "test_enemies" },
    },
  },
};

function stateWith(entityStates: SubMapState["entityStates"]): SubMapState {
  return { entityStates };
}

describe("wouldMapBeClearedAfterDefeatingMob", () => {
  // entityStates is keyed by "col,row" coordinate (matching allMobsDead()'s
  // production lookup), NOT by mob id — mob_a is at (0,0), mob_b at (1,0).
  it("is true when the triggering mob is the last live mob", () => {
    const state = stateWith({ "0,0": { alive: false }, "1,0": { alive: true } });
    expect(
      wouldMapBeClearedAfterDefeatingMob(twoMobMap, state, { x: 1, y: 0 }),
    ).toBe(true);
  });

  it("is false when another mob remains alive", () => {
    const state = stateWith({ "0,0": { alive: true }, "1,0": { alive: true } });
    expect(
      wouldMapBeClearedAfterDefeatingMob(twoMobMap, state, { x: 0, y: 0 }),
    ).toBe(false);
  });

  it("is true when the other mobs are already defeated", () => {
    const state = stateWith({ "0,0": { alive: false }, "1,0": { alive: false } });
    expect(
      wouldMapBeClearedAfterDefeatingMob(twoMobMap, state, { x: 0, y: 0 }),
    ).toBe(true);
  });

  it("does not mutate the supplied SubMapState", () => {
    const state = stateWith({ "0,0": { alive: true }, "1,0": { alive: true } });
    const snapshot = JSON.parse(JSON.stringify(state));
    wouldMapBeClearedAfterDefeatingMob(twoMobMap, state, { x: 0, y: 0 });
    expect(state).toEqual(snapshot);
  });
});
