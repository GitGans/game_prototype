import { describe, expect, it, vi } from "vitest";
import {
  PhaseManagerClass,
  type PhaseManagerDependencies,
} from "../../src/core/PhaseManager";
import type { GamePhase, PhaseAction } from "../../src/core/phases";
import type { PhaseTransitionMetadata } from "../../src/core/phaseTransitionMetadataContract";
import type { BattleActionFeedback } from "../../src/core/battleActionFeedback";

/**
 * The coordinator contract: PhaseManagerClass sequences its INJECTED collaborators and does
 * nothing else. Every dependency here is a plain fake — no domain module and no `GameState` is
 * mocked, because the coordinator is not allowed to know either exists.
 */

interface HarnessOptions {
  resolve(
    current: GamePhase,
    action: PhaseAction,
    metadata: PhaseTransitionMetadata,
  ): GamePhase | null;
  rebuiltPhase?: GamePhase;
  effectsError?: Error;
  snapshotError?: Error;
  initialize?: boolean;
  battleFeedback?: BattleActionFeedback | null;
}

function createHarness(options: HarnessOptions) {
  const calls: string[] = [];
  const feedback = options.battleFeedback ?? null;

  const deriveMetadata = vi.fn((_current: GamePhase, _action: PhaseAction) => {
    calls.push("metadata");
    return { mapCleared: false };
  });

  const resolveTransition = vi.fn(
    (current: GamePhase, action: PhaseAction, metadata: PhaseTransitionMetadata) => {
      calls.push("resolve");
      return options.resolve(current, action, metadata);
    },
  );

  const applyEffects = vi.fn(() => {
    calls.push("effects");
    if (options.effectsError) throw options.effectsError;
    return { battleFeedback: feedback };
  });

  let manager!: PhaseManagerClass;

  // What rebuildSnapshot actually returned, rather than `options.rebuiltPhase`: a case that
  // does not pin a rebuilt phase (the fake then echoes its input) must still be able to assert
  // commit-before-notify instead of comparing against `undefined`.
  let lastRebuilt: GamePhase | null = null;

  const rebuildSnapshot = vi.fn((phase: GamePhase) => {
    calls.push("snapshot");
    if (options.snapshotError) throw options.snapshotError;
    lastRebuilt = options.rebuiltPhase ?? phase;
    return lastRebuilt;
  });

  const notifyPhaseChanged = vi.fn(() => {
    calls.push("notify");

    // Новая фаза должна быть установлена до уведомления.
    expect(manager.getPhase()).toBe(lastRebuilt);
  });

  const dependencies: PhaseManagerDependencies = {
    deriveMetadata,
    resolveTransition,
    applyEffects,
    rebuildSnapshot,
    notifyPhaseChanged,
  };

  manager = new PhaseManagerClass(dependencies);

  const sync = vi.fn((phase: GamePhase) => {
    calls.push("sync");

    // Новая фаза должна быть установлена до уведомления сцены.
    expect(manager.getPhase()).toBe(phase);
  });

  if (options.initialize !== false) {
    manager.init({ sync });
  }

  return {
    manager,
    calls,
    sync,
    deriveMetadata,
    resolveTransition,
    applyEffects,
    rebuildSnapshot,
    notifyPhaseChanged,
  };
}

describe("PhaseManager coordinator contract", () => {
  it("stops immediately after rejected transition", () => {
    const harness = createHarness({
      resolve: () => null,
    });

    const originalPhase = harness.manager.getPhase();

    const result = harness.manager.transition({ type: "enter_camp" });

    expect(result).toEqual({ status: "rejected" });
    expect(harness.calls).toEqual(["metadata", "resolve"]);
    expect(harness.applyEffects).not.toHaveBeenCalled();
    expect(harness.rebuildSnapshot).not.toHaveBeenCalled();
    expect(harness.sync).not.toHaveBeenCalled();
    expect(harness.notifyPhaseChanged).not.toHaveBeenCalled();
    expect(harness.manager.getPhase()).toBe(originalPhase);
  });

  it("runs navigation pipeline in the required order", () => {
    const rebuiltPhase: GamePhase = { type: "debug_level_select" };

    const harness = createHarness({
      resolve: () => ({ type: "debug_level_select" }),
      rebuiltPhase,
    });

    const result = harness.manager.transition({ type: "debug" });

    expect(result).toEqual({ status: "applied", battleFeedback: null });
    expect(harness.calls).toEqual([
      "metadata",
      "resolve",
      "effects",
      "snapshot",
      "sync",
    ]);

    expect(harness.applyEffects).toHaveBeenCalledTimes(1);
    expect(harness.rebuildSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.sync).toHaveBeenCalledTimes(1);
    expect(harness.sync).toHaveBeenCalledWith(rebuiltPhase);
    expect(harness.notifyPhaseChanged).not.toHaveBeenCalled();
    expect(harness.manager.getPhase()).toBe(rebuiltPhase);
  });

  it("passes the exact phase, action, metadata and feedback objects through the pipeline", () => {
    const resolvedPhase: GamePhase = { type: "debug_level_select" };
    const rebuiltPhase: GamePhase = { type: "debug_level_select" };
    // A non-null sentinel: with a `null` fixture, `toEqual` and `toBe` are
    // indistinguishable, so a coordinator that RECONSTRUCTED the result would pass.
    const battleFeedback = { events: [] } as unknown as BattleActionFeedback;
    const action: PhaseAction = { type: "debug" };

    const harness = createHarness({
      resolve: () => resolvedPhase,
      rebuiltPhase,
      battleFeedback,
    });

    const previousPhase = harness.manager.getPhase();

    const result = harness.manager.transition(action);

    expect(harness.deriveMetadata).toHaveBeenCalledWith(previousPhase, action);

    const metadata = harness.deriveMetadata.mock.results[0].value;
    expect(harness.resolveTransition).toHaveBeenCalledWith(previousPhase, action, metadata);
    expect(harness.applyEffects).toHaveBeenCalledWith(action, previousPhase, resolvedPhase);
    expect(harness.rebuildSnapshot).toHaveBeenCalledWith(resolvedPhase);

    expect(harness.calls).toEqual([
      "metadata",
      "resolve",
      "effects",
      "snapshot",
      "sync",
    ]);

    expect(result).toEqual({ status: "applied", battleFeedback });
    expect((result as { battleFeedback: unknown }).battleFeedback).toBe(battleFeedback);
  });

  it("runs mutation-only pipeline and sends notification without scene sync", () => {
    const rebuiltPhase: GamePhase = { type: "main_menu" };

    const harness = createHarness({
      resolve: (current) => current,
      rebuiltPhase,
    });

    const result = harness.manager.transition({ type: "exit_to_menu" });

    expect(result).toEqual({ status: "applied", battleFeedback: null });
    expect(harness.calls).toEqual([
      "metadata",
      "resolve",
      "effects",
      "snapshot",
      "notify",
    ]);

    expect(harness.applyEffects).toHaveBeenCalledTimes(1);
    expect(harness.rebuildSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.notifyPhaseChanged).toHaveBeenCalledTimes(1);
    expect(harness.sync).not.toHaveBeenCalled();
    expect(harness.manager.getPhase()).toBe(rebuiltPhase);
  });

  it("classifies by resolver identity even when the snapshot returns a new object", () => {
    // Mutation-only snapshot rebuilding normally returns a NEW phase object. Classifying
    // after the rebuild would turn every in-battle mutation into a navigation.
    const rebuiltPhase: GamePhase = { type: "main_menu" };

    const harness = createHarness({
      resolve: (current) => current,
      rebuiltPhase,
    });

    const previousPhase = harness.manager.getPhase();
    expect(rebuiltPhase).not.toBe(previousPhase);

    harness.manager.transition({ type: "exit_to_menu" });

    expect(harness.notifyPhaseChanged).toHaveBeenCalledTimes(1);
    expect(harness.sync).not.toHaveBeenCalled();
    expect(harness.manager.getPhase()).toBe(rebuiltPhase);
  });

  it("treats a distinct phase object of the same type as navigation", () => {
    // This is `replay`'s shape: it resolves to `{ ...currentPhase }` — a COPY — so the phase
    // type is unchanged but the transition IS a navigation. A coordinator that compared
    // discriminators instead of identity would notify instead of syncing. The stand-in phase
    // type is irrelevant: the coordinator cannot see any field but the object reference.
    const first: GamePhase = { type: "debug_level_select" };
    const copy: GamePhase = { type: "debug_level_select" };

    let hop = 0;
    const harness = createHarness({
      resolve: () => (hop++ === 0 ? first : copy),
    });

    harness.manager.transition({ type: "debug" });
    expect(harness.manager.getPhase()).toBe(first);

    harness.calls.length = 0;
    harness.sync.mockClear();
    harness.notifyPhaseChanged.mockClear();

    harness.manager.transition({ type: "debug" });

    expect(harness.calls).toEqual([
      "metadata",
      "resolve",
      "effects",
      "snapshot",
      "sync",
    ]);
    expect(harness.sync).toHaveBeenCalledTimes(1);
    expect(harness.sync).toHaveBeenCalledWith(copy);
    expect(harness.notifyPhaseChanged).not.toHaveBeenCalled();
    expect(harness.manager.getPhase()).toBe(copy);
  });

  it("stops the pipeline when effects throw", () => {
    const error = new Error("effects failed");

    const harness = createHarness({
      resolve: () => ({ type: "debug_level_select" }),
      effectsError: error,
    });

    const originalPhase = harness.manager.getPhase();

    expect(() => harness.manager.transition({ type: "debug" })).toThrow(error);

    expect(harness.calls).toEqual(["metadata", "resolve", "effects"]);

    expect(harness.rebuildSnapshot).not.toHaveBeenCalled();
    expect(harness.sync).not.toHaveBeenCalled();
    expect(harness.notifyPhaseChanged).not.toHaveBeenCalled();
    expect(harness.manager.getPhase()).toBe(originalPhase);
  });

  it("does not commit or notify when snapshot rebuild throws", () => {
    const error = new Error("snapshot failed");

    const harness = createHarness({
      resolve: () => ({ type: "debug_level_select" }),
      snapshotError: error,
    });

    const originalPhase = harness.manager.getPhase();

    expect(() => harness.manager.transition({ type: "debug" })).toThrow(error);

    expect(harness.calls).toEqual([
      "metadata",
      "resolve",
      "effects",
      "snapshot",
    ]);

    expect(harness.sync).not.toHaveBeenCalled();
    expect(harness.notifyPhaseChanged).not.toHaveBeenCalled();
    expect(harness.manager.getPhase()).toBe(originalPhase);
  });

  it("checks scene synchronizer before navigation effects", () => {
    const harness = createHarness({
      resolve: () => ({ type: "debug_level_select" }),
      initialize: false,
    });

    const originalPhase = harness.manager.getPhase();

    expect(() => harness.manager.transition({ type: "debug" })).toThrow(
      /PhaseManager\.init/,
    );

    expect(harness.calls).toEqual(["metadata", "resolve"]);
    expect(harness.applyEffects).not.toHaveBeenCalled();
    expect(harness.rebuildSnapshot).not.toHaveBeenCalled();
    expect(harness.manager.getPhase()).toBe(originalPhase);
  });

  it("runs a mutation-only transition without init(), needing no scene synchronizer", () => {
    // Only NAVIGATION requires a registered synchronizer. A mutation refreshes the phase in
    // place and signals the already-running scene, so it must not demand one.
    const harness = createHarness({
      resolve: (current) => current,
      initialize: false,
    });

    const originalPhase = harness.manager.getPhase();

    const result = harness.manager.transition({ type: "exit_to_menu" });

    expect(result).toEqual({ status: "applied", battleFeedback: null });
    expect(harness.calls).toEqual([
      "metadata",
      "resolve",
      "effects",
      "snapshot",
      "notify",
    ]);
    expect(harness.notifyPhaseChanged).toHaveBeenCalledTimes(1);
    expect(harness.sync).not.toHaveBeenCalled();
    // The fake echoed its input, which for a mutation is the previous phase.
    expect(harness.manager.getPhase()).toBe(originalPhase);
  });
});
