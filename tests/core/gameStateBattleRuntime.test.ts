import { describe, it, expect, beforeEach } from "vitest";
import { GameState } from "../../src/core/GameState";
import {
  createEmptyBattleState,
  createBattleRuntimeContext,
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

const runtime = (sessionSource: "campaign" | "debug" = "campaign") =>
  createBattleRuntimeContext({
    state: createEmptyBattleState(),
    participants: [participant("knight")],
    replaySetup: replaySetup(),
    sessionSource,
  });

describe("GameState battle runtime", () => {
  beforeEach(() => {
    GameState.resetBattleRuntime();
  });

  it("throws from getBattleRuntime() before any runtime is installed", () => {
    expect(GameState.hasBattleRuntime()).toBe(false);
    expect(() => GameState.getBattleRuntime()).toThrow();
  });

  it("installs a complete runtime via setBattleRuntime()", () => {
    const next = runtime();
    GameState.setBattleRuntime(next);

    expect(GameState.hasBattleRuntime()).toBe(true);
    expect(GameState.getBattleRuntime()).toBe(next);
  });

  it("replaceBattleState() changes only state", () => {
    const original = runtime();
    GameState.setBattleRuntime(original);

    const nextState = createEmptyBattleState();
    GameState.replaceBattleState(nextState);

    const result = GameState.getBattleRuntime();
    expect(result.state).toBe(nextState);
    expect(result.mode).toBe(original.mode);
    expect(result.turnContext).toBe(original.turnContext);
    expect(result.participants).toBe(original.participants);
    expect(result.replaySetup).toBe(original.replaySetup);
    expect(result.sessionSource).toBe(original.sessionSource);
    expect(result.pendingAutoTurnIntention).toBe(original.pendingAutoTurnIntention);
  });

  it("replaceBattleMode() changes only mode", () => {
    const original = runtime();
    GameState.setBattleRuntime(original);

    GameState.replaceBattleMode("auto");

    const result = GameState.getBattleRuntime();
    expect(result.mode).toBe("auto");
    expect(result.state).toBe(original.state);
    expect(result.turnContext).toBe(original.turnContext);
    expect(result.participants).toBe(original.participants);
  });

  it("replaceBattleTurnContext() changes only turnContext", () => {
    const original = runtime();
    GameState.setBattleRuntime(original);

    const nextTurnContext = { ...original.turnContext };
    GameState.replaceBattleTurnContext(nextTurnContext);

    const result = GameState.getBattleRuntime();
    expect(result.turnContext).toBe(nextTurnContext);
    expect(result.state).toBe(original.state);
    expect(result.mode).toBe(original.mode);
  });

  it("replacePendingAutoTurnIntention() changes only pendingAutoTurnIntention", () => {
    const original = runtime();
    GameState.setBattleRuntime(original);

    const intention = {
      type: "advance_turn" as const,
      unitId: "p1",
      skillIndex: 0,
      activeUnitSide: "player" as const,
    };
    GameState.replacePendingAutoTurnIntention(intention);

    const result = GameState.getBattleRuntime();
    expect(result.pendingAutoTurnIntention).toBe(intention);
    expect(result.state).toBe(original.state);
    expect(result.mode).toBe(original.mode);
  });

  it("resetBattleRuntime() removes the whole context", () => {
    GameState.setBattleRuntime(runtime());
    GameState.resetBattleRuntime();

    expect(GameState.hasBattleRuntime()).toBe(false);
    expect(() => GameState.getBattleRuntime()).toThrow();
  });

  it("installing a new runtime retains nothing from the previous one", () => {
    const first = runtime("campaign");
    GameState.setBattleRuntime(first);
    GameState.replaceBattleMode("auto");

    const second = runtime("debug");
    GameState.setBattleRuntime(second);

    const result = GameState.getBattleRuntime();
    expect(result).toBe(second);
    expect(result.sessionSource).toBe("debug");
    expect(result.mode).toBe("manual");
    expect(result.state).not.toBe(first.state);
    expect(result.participants).not.toBe(first.participants);
  });
});
