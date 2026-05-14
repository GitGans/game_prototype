import type { BattleState, Unit, BenchUnitRef } from './types';
import type { Rng }                              from '../shared/random';
import { pickOne }                               from '../shared/random';
import type { CellCoord, Col, Row, UnitShape }   from '../shared/gridTypes';
import type { RowTrait }                         from '../shared/unitTypes';
import { canPlace, addFieldUnit, addBenchUnit }  from './placement';
import { getFreeBenchSlot }                      from './deployment';
import { cellKey }                               from './field';
import { createUnitInstance }                    from './unitFactory';
import type { CreateUnitInstanceInput }          from './unitFactory';

// ─── Candidate Contracts ─────────────────────────────────────────────────────

export interface PlayerPlacementCandidate {
  templateId:  string;
  shape:       UnitShape;
  rowTrait:    RowTrait;
  savedAnchor: CellCoord | null;
  createUnit:  (id: string) => Unit; // no anchor; deployment is assigned separately
}

export interface EnemyPlacementCandidate {
  templateId: string;
  shape:      UnitShape;
  rowTrait:   RowTrait;
  createUnit: (id: string) => Unit;
}

export interface EnemyPlacementCandidates {
  frontPool: EnemyPlacementCandidate[];
  backPool:  EnemyPlacementCandidate[];
}

// Anchor is carried outside CreateUnitInstanceInput because CreateUnitInstanceInput
// no longer contains anchor. core/ imports this type from battle/; that is allowed
// since core may depend on battle.
export interface EnemyReplayPlacementInput {
  unitInput: CreateUnitInstanceInput;
  anchor:    CellCoord;
}

// ─── Player Placement ────────────────────────────────────────────────────────

export function autoPlacePlayer(
  state:          BattleState,
  candidates:     PlayerPlacementCandidate[],
  benchSlotCount: number,
): BattleState {
  state = { ...state, benchSlotCount };

  let counter = 1;
  const benchMirror: (BenchUnitRef | undefined)[] = Array(benchSlotCount).fill(undefined);

  const tryPlaceOnField = (c: PlayerPlacementCandidate): boolean => {
    if (c.savedAnchor && canPlace(c.savedAnchor, c.shape, state, 'player')) {
      state = addFieldUnit(state, c.createUnit(`p${counter++}`), c.savedAnchor);
      return true;
    }
    const rows: Row[] = c.rowTrait === 'front' ? [0, 1] : [1, 0];
    for (const row of rows) {
      for (const col of [0, 1, 2] as Col[]) {
        const anchor: CellCoord = { side: 'player', row, col };
        if (canPlace(anchor, c.shape, state, 'player')) {
          state = addFieldUnit(state, c.createUnit(`p${counter++}`), anchor);
          return true;
        }
      }
    }
    return false;
  };

  const tryPlaceOnBench = (c: PlayerPlacementCandidate): boolean => {
    const slot = getFreeBenchSlot(state);
    if (slot === null) return false;
    const unit = c.createUnit(`p${counter++}`);
    state = addBenchUnit(state, unit, slot);
    benchMirror[slot] = { templateId: unit.templateId }; // synchronize compatibility mirror
    return true;
  };

  const overflow: PlayerPlacementCandidate[] = [];
  for (const c of candidates) {
    if (!tryPlaceOnField(c)) overflow.push(c);
  }
  for (const c of overflow) {
    if (!tryPlaceOnBench(c)) tryPlaceOnField(c);
  }

  return { ...state, benchUnits: benchMirror };
}

// ─── Enemy Placement ─────────────────────────────────────────────────────────

export function autoPlaceEnemies(
  state:      BattleState,
  candidates: EnemyPlacementCandidates,
  rng:        Rng,
): BattleState {
  let counter = 1;
  const cols: Col[] = [0, 1, 2];

  for (const col of cols) {
    const anchor: CellCoord = { side: 'enemy', row: 0, col };
    if (state.occupancy.cellToUnitId.has(cellKey(anchor))) continue;
    if (candidates.frontPool.length === 0) continue;
    const c = pickOne(rng, candidates.frontPool);
    if (canPlace(anchor, c.shape, state, 'enemy')) {
      state = addFieldUnit(state, c.createUnit(`e${counter++}`), anchor);
    }
  }

  for (const col of cols) {
    const anchor: CellCoord = { side: 'enemy', row: 1, col };
    if (state.occupancy.cellToUnitId.has(cellKey(anchor))) continue;
    if (candidates.backPool.length === 0) continue;
    const c = pickOne(rng, candidates.backPool);
    if (canPlace(anchor, c.shape, state, 'enemy')) {
      state = addFieldUnit(state, c.createUnit(`e${counter++}`), anchor);
    }
  }

  return state;
}

// ─── Replay Placement ────────────────────────────────────────────────────────

export function replayPlaceEnemies(
  state:  BattleState,
  inputs: EnemyReplayPlacementInput[],
): BattleState {
  for (const { unitInput, anchor } of inputs) {
    const unit = createUnitInstance(unitInput);
    if (canPlace(anchor, unitInput.blueprint.shape, state, 'enemy')) {
      state = addFieldUnit(state, unit, anchor);
    }
  }
  return state;
}
