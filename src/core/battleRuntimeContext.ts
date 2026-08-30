import { buildOccupancy } from "../battle/occupancy";
import { type TurnContext, createTurnContext } from "../battle/turnResolver";
import type { BattleState, BattleMode } from "../battle/types";
import type { CellCoord, Side } from "../shared/gridTypes";
import type { PlayerSessionSource } from "./playerSessionState";

export type BattleExitOutcome = "victory" | "defeat";

/** Snapshot of one player unit at the moment of battle exit — pre-level-up. */
export interface BattleParticipant {
  readonly templateId: string;
  readonly name: string;
  readonly level: number; // current level BEFORE +1
  readonly isAlive: boolean;
  readonly wasOnBench: boolean;
  readonly spriteKey: string | null;
}

export interface EnemyReplayPlacement {
  readonly templateId: string;
  readonly anchor: CellCoord;
  readonly level: number;
}

/**
 * The captured data needed to reconstruct one encounter's enemy formation on replay.
 * The encounter ID lives on the battle phase and is deliberately not duplicated here —
 * replay restores the captured placements and never regenerates a group.
 */
export interface BattleReplaySetup {
  readonly enemyPlacements: readonly EnemyReplayPlacement[];
}

export type AutoTurnIntention =
  | {
      readonly type: "skip_turn";
      readonly unitId: string;
      readonly skillIndex: number;
      readonly reason: "blocked_melee";
      readonly activeUnitSide: Side;
    }
  | {
      readonly type: "advance_turn";
      readonly unitId: string;
      readonly skillIndex: number;
      readonly activeUnitSide: Side;
    }
  | {
      readonly type: "use_skill";
      readonly unitId: string;
      readonly skillIndex: number;
      readonly target: CellCoord;
      readonly activeUnitSide: Side;
    };

/**
 * All authoritative data for exactly one active battle attempt.
 *
 * **Read-only at every runtime-owned depth.** `requireBattleRuntimeForPhase()`
 * (`battleRuntimeAccess.ts`) hands this back as-is, so holding a runtime is the authority
 * to *read* it and nothing more: a change is made by constructing a complete replacement
 * and installing it through `battleRuntimeWriteAccess`, which only `battlePhaseEffects`
 * may import. The one documented exception is the `ActionSkillDefinition` entries inside
 * `unit.skills` — shared immutable static content from the SKILLS registry, not
 * runtime-owned; the containing array is readonly. `readonly` is erased at runtime, so
 * the defensive copies below remain the runtime guarantee and are not redundant with it.
 *
 * A battle phase is active if and only if this is non-null. `runtime.sessionSource`
 * must always equal the active battle phase's `sessionSource` — validated by
 * `requireBattleRuntimeForPhase()` at every production read and mutation site, not only
 * when the render snapshot is built. `BattleRuntimeContext` is never serialized and
 * never exposed to scenes directly — `GamePhase.participants` is a separate, copied
 * render projection, not an alias of `runtime.participants`.
 */
export interface BattleRuntimeContext {
  readonly state: BattleState;
  readonly participants: readonly BattleParticipant[];
  readonly replaySetup: BattleReplaySetup;
  readonly turnContext: TurnContext;
  readonly mode: BattleMode;
  readonly sessionSource: PlayerSessionSource;
  readonly pendingAutoTurnIntention: AutoTurnIntention | null;
}

export function createEmptyBattleState(): BattleState {
  return {
    units: new Map(),
    occupancy: buildOccupancy(new Map(), new Map()),
    roundQueue: [],
    phase: "placement",
    validTargets: [],
    nextPlayerId: 1,
    placementSelection: {
      selectedBenchUnitId: null,
      selectedFieldUnitId: null,
    },
    previewTargetCoord: null,
    deployments: new Map(),
    benchSlotCount: 0,
  };
}

function copyReplaySetup(setup: BattleReplaySetup): BattleReplaySetup {
  return {
    enemyPlacements: setup.enemyPlacements.map((p) => ({
      ...p,
      anchor: { ...p.anchor },
    })),
  };
}

export function createBattleRuntimeContext(input: {
  state: BattleState;
  participants: readonly BattleParticipant[];
  replaySetup: BattleReplaySetup;
  sessionSource: PlayerSessionSource;
}): BattleRuntimeContext {
  return {
    state: input.state,
    participants: input.participants.map((p) => ({ ...p })),
    replaySetup: copyReplaySetup(input.replaySetup),
    turnContext: createTurnContext(),
    mode: "manual",
    sessionSource: input.sessionSource,
    pendingAutoTurnIntention: null,
  };
}
