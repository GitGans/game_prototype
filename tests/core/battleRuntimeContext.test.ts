import { describe, it, expect } from "vitest";
import {
  createEmptyBattleState,
  createBattleRuntimeContext,
  restartBattleRuntime,
  type BattleReplaySetup,
  type BattleParticipant,
} from "../../src/core/battleRuntimeContext";
import { coord } from "../battle/helpers/coords";

const participant = (templateId: string): BattleParticipant => ({
  templateId,
  name: templateId,
  level: 1,
  isAlive: true,
  wasOnBench: false,
  spriteKey: null,
});

const replaySetup = (): BattleReplaySetup => ({
  enemyGroupId: "group_a",
  enemyPlacements: [{ templateId: "orc", anchor: coord("enemy", 0, 0), level: 3 }],
});

describe("createEmptyBattleState", () => {
  it("returns independent collections on every call", () => {
    const a = createEmptyBattleState();
    const b = createEmptyBattleState();

    a.units.set("p1", {} as never);
    a.deployments.set("p1", {} as never);

    expect(b.units.size).toBe(0);
    expect(b.deployments.size).toBe(0);
    expect(a).not.toBe(b);
    expect(a.occupancy).not.toBe(b.occupancy);
  });

  it("starts in the placement phase with empty selection and bench count", () => {
    const state = createEmptyBattleState();
    expect(state.phase).toBe("placement");
    expect(state.nextPlayerId).toBe(1);
    expect(state.previewTargetCoord).toBeNull();
    expect(state.benchSlotCount).toBe(0);
    expect(state.placementSelection).toEqual({ selectedBenchUnitId: null, selectedFieldUnitId: null });
  });
});

describe("createBattleRuntimeContext", () => {
  it("initializes manual mode, a fresh turn context, and no pending intention", () => {
    const runtime = createBattleRuntimeContext({
      state: createEmptyBattleState(),
      participants: [participant("knight")],
      replaySetup: replaySetup(),
      sessionSource: "campaign",
    });

    expect(runtime.mode).toBe("manual");
    expect(runtime.pendingAutoTurnIntention).toBeNull();
    expect(runtime.sessionSource).toBe("campaign");
    expect(runtime.turnContext).toBeDefined();
  });

  it("copies participants and replay placements instead of aliasing the caller's arrays", () => {
    const participants = [participant("knight")];
    const setup = replaySetup();

    const runtime = createBattleRuntimeContext({
      state: createEmptyBattleState(),
      participants,
      replaySetup: setup,
      sessionSource: "debug",
    });

    participants[0].level = 99;
    setup.enemyPlacements[0].level = 99;
    setup.enemyPlacements[0].anchor.row = 99;

    expect(runtime.participants[0].level).toBe(1);
    expect(runtime.replaySetup.enemyPlacements[0].level).toBe(3);
    expect(runtime.replaySetup.enemyPlacements[0].anchor.row).toBe(0);
  });
});

describe("restartBattleRuntime", () => {
  it("preserves sessionSource, participants, and the supplied replay setup", () => {
    const original = createBattleRuntimeContext({
      state: createEmptyBattleState(),
      participants: [participant("knight"), participant("mage")],
      replaySetup: replaySetup(),
      sessionSource: "debug",
    });

    const nextReplaySetup: BattleReplaySetup = {
      enemyGroupId: "group_b",
      enemyPlacements: [{ templateId: "demon", anchor: coord("enemy", 1, 1), level: 5 }],
    };
    const nextState = createEmptyBattleState();

    const restarted = restartBattleRuntime(original, nextState, nextReplaySetup);

    expect(restarted.sessionSource).toBe("debug");
    expect(restarted.participants).toEqual(original.participants);
    expect(restarted.participants).not.toBe(original.participants);
    expect(restarted.replaySetup).toEqual(nextReplaySetup);
    expect(restarted.replaySetup).not.toBe(nextReplaySetup);
    expect(restarted.state).toBe(nextState);
  });

  it("resets mode, turn context, and pending intention", () => {
    const original = createBattleRuntimeContext({
      state: createEmptyBattleState(),
      participants: [participant("knight")],
      replaySetup: replaySetup(),
      sessionSource: "campaign",
    });
    const mutated = {
      ...original,
      mode: "auto" as const,
      pendingAutoTurnIntention: {
        type: "advance_turn" as const,
        unitId: "p1",
        skillIndex: 0,
        activeUnitSide: "player" as const,
      },
    };

    const restarted = restartBattleRuntime(mutated, createEmptyBattleState(), replaySetup());

    expect(restarted.mode).toBe("manual");
    expect(restarted.pendingAutoTurnIntention).toBeNull();
    expect(restarted.turnContext).not.toBe(mutated.turnContext);
  });
});
