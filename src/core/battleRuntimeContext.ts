import { buildOccupancy } from '../battle/occupancy';
import {
  type TurnContext,
  createTurnContext,
} from '../battle/turnResolver';
import type { BattleState, BattleMode } from '../battle/types';
import type { CellCoord, Side } from '../shared/gridTypes';
import type { PlayerSessionSource } from './playerSessionState';

export type BattleExitOutcome = 'victory' | 'defeat';

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

/**
 * The captured data needed to reconstruct one encounter's enemy formation on replay.
 * The encounter ID lives on the battle phase and is deliberately not duplicated here —
 * replay restores the captured placements and never regenerates a group.
 */
export interface BattleReplaySetup {
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
