import { describe, expect, it, vi } from "vitest";
import {
  PhaseManagerClass,
  type PhaseManagerDependencies,
} from "../../src/core/PhaseManager";
import type { GamePhase } from "../../src/core/phases";

interface HarnessOptions {
  resolve(current: GamePhase): GamePhase | null;
  rebuiltPhase?: GamePhase;
  effectsError?: Error;
  snapshotError?: Error;
  initialize?: boolean;
}

function createHarness(options: HarnessOptions) {
  const calls: string[] = [];

  const deriveMetadata = vi.fn(() => {
    calls.push("metadata");
    return { mapCleared: false };
  });

  const resolveTransition = vi.fn((current: GamePhase) => {
    calls.push("resolve");
    return options.resolve(current);
  });

  const applyEffects = vi.fn(() => {
    calls.push("effects");
    if (options.effectsError) throw options.effectsError;
    return { battleFeedback: null };
  });

  const rebuildSnapshot = vi.fn((phase: GamePhase) => {
    calls.push("snapshot");
    if (options.snapshotError) throw options.snapshotError;
    return options.rebuiltPhase ?? phase;
  });

  let manager!: PhaseManagerClass;

  const notifyPhaseChanged = vi.fn(() => {
    calls.push("notify");
    expect(manager.getPhase()).toBe(options.rebuiltPhase);
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
});
