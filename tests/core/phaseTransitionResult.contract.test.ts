import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createLifecycleHarness,
  resetGameStateBetweenTests,
  DEMON_PATROL_ENEMY_GROUP_ID,
  ORC_PATROL_ENEMY_GROUP_ID,
  ORC_PATROL_TRIGGER_POS,
  type LifecycleHarness,
} from "./helpers/phaseManagerLifecycleHarness";
import { GameState } from "../../src/core/GameState";
import { EventBus, Events } from "../../src/core/EventBus";

/**
 * Contract for the value PhaseManager.transition() returns.
 *
 * The result deliberately carries no navigation/mutation classification — routing
 * belongs to phaseTransitionResolver — so those two pipeline shapes are asserted
 * through observable behavior instead: scene synchronization vs STATE_CHANGED.
 *
 * The projection's exactness is covered by battleActionFeedback.test.ts; this file
 * covers call scoping — that feedback belongs to the invocation that produced it
 * and to no other.
 */

const PUBLIC_FEEDBACK_KEYS = [
  "events",
  "directive",
  "winner",
  "autoTurnDirective",
  "autoTurnApplied",
];

describe("PhaseManager.transition() public result", () => {
  let harness: LifecycleHarness;
  let stateChangedCount: number;
  const countStateChanged = () => {
    stateChangedCount += 1;
  };

  beforeEach(() => {
    harness = createLifecycleHarness();
    stateChangedCount = 0;
    EventBus.on(Events.STATE_CHANGED, countStateChanged);
  });

  afterEach(() => {
    EventBus.off(Events.STATE_CHANGED, countStateChanged);
    resetGameStateBetweenTests();
  });

  it("no longer exposes the stored battle-result accessor", () => {
    expect("getLastBattleTransition" in harness.manager).toBe(false);
  });

  it("returns exactly the rejected variant for an invalid action", () => {
    // main_menu, not battle — the resolver rejects this outright.
    const result = harness.manager.transition({ type: "exit_battle", outcome: "victory" });

    expect(result).toEqual({ status: "rejected" });
  });

  it("performs no scene sync and no notification for a rejected action", () => {
    harness.openDebugSession(3);
    harness.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);

    const syncsBefore = harness.sync.mock.calls.length;
    stateChangedCount = 0;

    // reset_debug_session is accepted only from debug_equip_screen.
    const result = harness.manager.transition({ type: "reset_debug_session" });

    expect(result).toEqual({ status: "rejected" });
    expect(harness.sync.mock.calls.length).toBe(syncsBefore);
    expect(stateChangedCount).toBe(0);
  });

  it("returns applied with null feedback for a navigating action, and syncs the scene", () => {
    harness.startNewCampaign();

    const syncsBefore = harness.sync.mock.calls.length;
    stateChangedCount = 0;

    const result = harness.manager.transition({ type: "enter_camp" });

    expect(result).toEqual({ status: "applied", battleFeedback: null });
    expect(harness.sync.mock.calls.length).toBe(syncsBefore + 1);
    expect(harness.syncedPhases.at(-1)).toBe(harness.manager.getPhase());
    expect(stateChangedCount).toBe(0);
  });

  it("returns applied with null feedback for a mutation-only action, and notifies instead of syncing", () => {
    harness.openDebugSession(3);
    harness.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);

    const syncsBefore = harness.sync.mock.calls.length;
    const phaseBefore = harness.manager.getPhase();
    stateChangedCount = 0;

    const result = harness.manager.transition({ type: "battle_set_mode", mode: "auto" });

    expect(result).toEqual({ status: "applied", battleFeedback: null });
    expect(harness.sync.mock.calls.length).toBe(syncsBefore);
    expect(stateChangedCount).toBe(1);
    // Mutation-only still commits a rebuilt snapshot.
    expect(harness.manager.getPhase()).not.toBe(phaseBefore);
    expect(harness.manager.getPhase().type).toBe("battle");
  });

  it("returns battle feedback for a real turn action", () => {
    harness.openDebugSession(3);
    harness.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
    harness.manager.transition({ type: "battle_begin_combat" });

    const result = harness.manager.transition({ type: "battle_start_turn" });

    expect(result.status).toBe("applied");
    const feedback = result.status === "applied" ? result.battleFeedback : null;
    expect(feedback).not.toBeNull();

    // resolveActiveTurnStart returns events: [] on every ordinary turn-start path,
    // so assert the shape, not a non-empty array.
    expect(Array.isArray(feedback!.events)).toBe(true);
    expect(feedback!.directive).toBeDefined();
    expect(typeof feedback!.directive!.type).toBe("string");
  });

  it("never carries authoritative state through the real pipeline", () => {
    harness.openDebugSession(3);
    harness.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
    harness.manager.transition({ type: "battle_begin_combat" });

    const result = harness.manager.transition({ type: "battle_start_turn" });
    const feedback = result.status === "applied" ? result.battleFeedback! : null;

    expect(feedback).not.toBeNull();
    for (const key of Object.keys(feedback!)) {
      expect(PUBLIC_FEEDBACK_KEYS).toContain(key);
    }
    expect("state" in feedback!).toBe(false);
    expect("context" in feedback!).toBe(false);
    if (feedback!.directive) {
      expect("validTargets" in feedback!.directive).toBe(false);
      expect("activeSkill" in feedback!.directive).toBe(false);
    }
  });

  it("cannot expose earlier battle feedback through a later rejected action", () => {
    harness.openDebugSession(3);
    harness.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
    harness.manager.transition({ type: "battle_begin_combat" });

    const battleResult = harness.manager.transition({ type: "battle_start_turn" });
    expect(battleResult.status).toBe("applied");

    // Rejected from an active battle — the stored-result protocol would have left
    // the previous turn's feedback readable at this point.
    const rejected = harness.manager.transition({ type: "reset_debug_session" });

    expect(rejected).toEqual({ status: "rejected" });
  });

  it("cannot expose earlier battle feedback through a later unrelated applied action", () => {
    harness.openDebugSession(3);
    harness.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
    harness.manager.transition({ type: "battle_begin_combat" });
    harness.manager.transition({ type: "battle_start_turn" });

    const result = harness.manager.transition({ type: "battle_set_mode", mode: "auto" });

    expect(result).toEqual({ status: "applied", battleFeedback: null });
  });

  it("gives each invocation its own feedback object", () => {
    harness.openDebugSession(3);
    harness.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
    harness.manager.transition({ type: "battle_begin_combat" });

    const first = harness.manager.transition({ type: "battle_start_turn" });
    const second = harness.manager.transition({ type: "battle_start_turn" });

    expect(first.status).toBe("applied");
    expect(second.status).toBe("applied");
    const firstFeedback = first.status === "applied" ? first.battleFeedback! : null;
    const secondFeedback = second.status === "applied" ? second.battleFeedback! : null;

    expect(firstFeedback).not.toBe(secondFeedback);
    expect(firstFeedback!.events).not.toBe(secondFeedback!.events);
  });

  it("does not hand the scene the runtime-owned pending auto-turn intention", () => {
    harness.openDebugSession(3);
    harness.startDebugBattle(ORC_PATROL_ENEMY_GROUP_ID);
    harness.manager.transition({ type: "battle_begin_combat" });
    harness.manager.transition({ type: "battle_set_mode", mode: "auto" });

    const result = harness.manager.transition({ type: "battle_decide_auto_turn" });
    const directive =
      result.status === "applied" ? result.battleFeedback?.autoTurnDirective : undefined;

    // Asserted rather than guarded with an early return: a decision that stopped
    // producing an intention would otherwise make this test silently vacuous.
    expect(directive?.type).toBe("intention");
    if (directive?.type !== "intention") return;

    const pending = GameState.getBattleRuntime().pendingAutoTurnIntention;
    expect(pending).not.toBeNull();
    expect(directive.intention).not.toBe(pending);
    expect(directive.intention.unitId).toBe(pending!.unitId);
  });

  it("treats replay as a navigation even though the phase stays battle", () => {
    harness.openDebugSession(3);
    harness.startDebugBattle(DEMON_PATROL_ENEMY_GROUP_ID);

    const phaseBefore = harness.manager.getPhase();
    const runtimeBefore = GameState.getBattleRuntime();
    const syncsBefore = harness.sync.mock.calls.length;
    stateChangedCount = 0;

    const result = harness.manager.transition({ type: "replay" });

    expect(result).toEqual({ status: "applied", battleFeedback: null });
    // The resolver returns `{ ...currentPhase }` — a copy — so this is a navigation
    // by reference identity despite the unchanged phase type. Anyone "simplifying"
    // the classification to compare `.type` breaks scene sync here.
    expect(harness.sync.mock.calls.length).toBe(syncsBefore + 1);
    expect(stateChangedCount).toBe(0);
    expect(harness.manager.getPhase().type).toBe("battle");
    expect(harness.manager.getPhase()).not.toBe(phaseBefore);
    expect(GameState.getBattleRuntime()).not.toBe(runtimeBefore);
  });

  it("returns applied with null feedback for a campaign world action", () => {
    harness.startNewCampaign();
    const phase = harness.manager.getPhase();
    expect(phase.type).toBe("world_map");

    const result = harness.manager.transition({
      type: "move_party",
      partyPos: ORC_PATROL_TRIGGER_POS,
    });

    expect(result).toEqual({ status: "applied", battleFeedback: null });
  });
});
