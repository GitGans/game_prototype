import { buildOccupancy } from '../battle/occupancy';
import {
  type TurnContext,
  createTurnContext,
  resetTurnContextForNewBattle,
} from '../battle/turnResolver';
import type { BattleState, BattleMode } from '../battle/types';
import type { CellCoord, Side } from '../shared/gridTypes';
import type { PlayerSessionSource } from './playerSessionState';

/** Snapshot of one player unit at the moment of battle exit — pre-level-up. */
export interface BattleParticipant {
  templateId: string;
  name: string;
  level: number;       // current level BEFORE +1
  isAlive: boolean;
  wasOnBench: boolean;
  spriteKey: string | null;
}

export interface EnemyReplayPlacement {
  templateId: string;
  anchor: CellCoord;
  level: number;
}

export interface BattleReplaySetup {
  enemyGroupId: string;
  enemyPlacements: EnemyReplayPlacement[];
}

export type AutoTurnIntention =
  | { type: 'skip_turn';    unitId: string; skillIndex: number; reason: 'blocked_melee'; activeUnitSide: Side }
  | { type: 'advance_turn'; unitId: string; skillIndex: number;                          activeUnitSide: Side }
  | { type: 'use_skill';    unitId: string; skillIndex: number; target: CellCoord; activeUnitSide: Side };

/**
 * All authoritative, mutable data for exactly one active battle attempt.
 * A battle phase is active if and only if this is non-null. `runtime.sessionSource`
 * must always equal the active battle phase's `sessionSource` — validated by
 * `PhaseManagerClass.requireBattleRuntime()` at every read/mutation site, not only
 * when the render snapshot is built. `BattleRuntimeContext` is never serialized and
 * never exposed to scenes directly — `GamePhase.participants` is a separate, copied
 * render projection, not an alias of `runtime.participants`.
 */
export interface BattleRuntimeContext {
  state: BattleState;
  participants: BattleParticipant[];
  replaySetup: BattleReplaySetup;
  turnContext: TurnContext;
  mode: BattleMode;
  sessionSource: PlayerSessionSource;
  pendingAutoTurnIntention: AutoTurnIntention | null;
}

export function createEmptyBattleState(): BattleState {
  return {
    units:              new Map(),
    occupancy:          buildOccupancy(new Map(), new Map()),
    roundQueue:         [],
    phase:              'placement',
    validTargets:       [],
    nextPlayerId:       1,
    placementSelection: { selectedBenchUnitId: null, selectedFieldUnitId: null },
    previewTargetCoord: null,
    deployments:        new Map(),
    benchSlotCount:     0,
  };
}

function copyReplaySetup(setup: BattleReplaySetup): BattleReplaySetup {
  return {
    enemyGroupId: setup.enemyGroupId,
    enemyPlacements: setup.enemyPlacements.map(p => ({ ...p, anchor: { ...p.anchor } })),
  };
}

export function createBattleRuntimeContext(input: {
  state: BattleState;
  participants: BattleParticipant[];
  replaySetup: BattleReplaySetup;
  sessionSource: PlayerSessionSource;
}): BattleRuntimeContext {
  return {
    state:         input.state,
    participants:  input.participants.map(p => ({ ...p })),
    replaySetup:   copyReplaySetup(input.replaySetup),
    turnContext:   createTurnContext(),
    mode:          'manual',
    sessionSource: input.sessionSource,
    pendingAutoTurnIntention: null,
  };
}

/**
 * Replaces per-attempt mutable state while preserving the battle-start
 * participant snapshot and source. `nextReplaySetup` is required explicitly:
 * campaign replay passes back the current runtime's own replaySetup (same
 * enemies), debug replay passes a freshly generated one (new enemies).
 */
export function restartBattleRuntime(
  current: BattleRuntimeContext,
  nextState: BattleState,
  nextReplaySetup: BattleReplaySetup,
): BattleRuntimeContext {
  return {
    state:         nextState,
    participants:  current.participants.map(p => ({ ...p })),
    replaySetup:   copyReplaySetup(nextReplaySetup),
    turnContext:   resetTurnContextForNewBattle(),
    mode:          'manual',
    sessionSource: current.sessionSource,
    pendingAutoTurnIntention: null,
  };
}
