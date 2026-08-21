import { describe, expect, it, vi } from "vitest";
import { PhaseManagerClass } from "../../src/core/PhaseManager";
import { GameState } from "../../src/core/GameState";
import type { PhaseSceneSynchronizer } from "../../src/core/phaseSceneSynchronizer";

function fakeSynchronizer(): PhaseSceneSynchronizer & { sync: ReturnType<typeof vi.fn> } {
  return { sync: vi.fn() };
}

describe("PhaseManagerClass orchestration boundary", () => {
  it("calls sync() exactly once with the rebuilt phase on a navigation transition", () => {
    const manager = new PhaseManagerClass();
    const sync = fakeSynchronizer();
    manager.init(sync);

    manager.transition({ type: "debug" }); // main_menu -> debug_level_select

    expect(sync.sync).toHaveBeenCalledTimes(1);
    expect(sync.sync).toHaveBeenCalledWith(manager.getPhase());
    expect(manager.getPhase().type).toBe("debug_level_select");
  });

  it("does not call sync() on a rejected transition", () => {
    const manager = new PhaseManagerClass();
    const sync = fakeSynchronizer();
    manager.init(sync);

    manager.transition({ type: "enter_camp" }); // invalid from main_menu

    expect(sync.sync).not.toHaveBeenCalled();
    expect(manager.getPhase()).toEqual({ type: "main_menu" });
  });

  it("does not call sync() on a mutation-only transition", () => {
    const manager = new PhaseManagerClass();
    const sync = fakeSynchronizer();
    manager.init(sync);

    manager.transition({ type: "debug" });
    manager.transition({ type: "init_debug", level: 1 });
    sync.sync.mockClear();

    manager.transition({ type: "reset_debug_session" }); // mutation-only from debug_equip_screen

    expect(sync.sync).not.toHaveBeenCalled();
  });

  it("throws before init() and causes no state mutation, even for a side-effecting action", () => {
    // `new_game` is deliberately chosen over a no-op action like `debug`: its side effects
    // (GameState.setCampaignState, RNG reset, clearDebugSession, resetBattleRuntime) are
    // exactly what the preflight-ordering fix must prevent from running before the
    // synchronizer check. A test using a non-mutating action would still pass even if the
    // preflight check were accidentally moved back after applyActionSideEffects().
    const manager = new PhaseManagerClass();
    const before = manager.getPhase();
    const hadCampaignStateBefore = GameState.hasCampaignState();

    expect(() => manager.transition({ type: "new_game" })).toThrow(/PhaseManager\.init/);

    expect(manager.getPhase()).toBe(before); // no phase change
    expect(GameState.hasCampaignState()).toBe(hadCampaignStateBefore); // no campaign was created
    expect(manager.getLastBattleTransition()).toBeNull(); // lastBattleTransition reset didn't run either
  });
});
