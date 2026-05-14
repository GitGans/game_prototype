import type { BattleState, Unit }             from './types';
import type { Rng }                            from '../shared/random';
import { pickOne }                             from '../shared/random';
import type { BenchUnitRef }                   from './types';
import type { CellCoord, Col, Row, UnitShape } from '../shared/gridTypes';
import type { RowTrait }                       from '../shared/unitTypes';
import { canPlace, placeUnit }                 from './placement';
import { cellKey }                             from './field';
import { createUnitInstance }                  from './unitFactory';
import type { CreateUnitInstanceInput }        from './unitFactory';

export interface PlayerPlacementCandidate {
  templateId:  string;
  shape:       UnitShape;
  rowTrait:    RowTrait;
  savedAnchor: CellCoord | null;
  createUnit:  (anchor: CellCoord, id: string) => Unit;
}

export interface EnemyPlacementCandidate {
  templateId: string;
  shape:      UnitShape;
  rowTrait:   RowTrait;
  createUnit: (anchor: CellCoord, id: string) => Unit;
}

export interface EnemyPlacementCandidates {
  frontPool: EnemyPlacementCandidate[];
  backPool:  EnemyPlacementCandidate[];
}

export function autoPlacePlayer(
  state:          BattleState,
  candidates:     PlayerPlacementCandidate[],
  benchSlotCount: number,
): BattleState {
  let counter = 1;
  const paddedBench: (BenchUnitRef | undefined)[] = Array(benchSlotCount).fill(undefined);

  const addToBench = (templateId: string): boolean => {
    const slot = paddedBench.indexOf(undefined);
    if (slot === -1) return false;
    paddedBench[slot] = { templateId };
    return true;
  };

  const tryPlaceOnField = (c: PlayerPlacementCandidate): boolean => {
    if (c.savedAnchor && canPlace(c.savedAnchor, c.shape, state, 'player')) {
      state = placeUnit(c.createUnit(c.savedAnchor, `p${counter++}`), state);
      return true;
    }
    const rows: Row[] = c.rowTrait === 'front' ? [0, 1] : [1, 0];
    for (const row of rows) {
      for (const col of [0, 1, 2] as Col[]) {
        const anchor: CellCoord = { side: 'player', row, col };
        if (canPlace(anchor, c.shape, state, 'player')) {
          state = placeUnit(c.createUnit(anchor, `p${counter++}`), state);
          return true;
        }
      }
    }
    return false;
  };

  const overflow: PlayerPlacementCandidate[] = [];
  for (const c of candidates) {
    if (!tryPlaceOnField(c)) overflow.push(c);
  }
  for (const c of overflow) {
    if (!addToBench(c.templateId)) tryPlaceOnField(c);
  }

  return { ...state, benchUnits: paddedBench, benchSlotCount };
}

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
    const unit = c.createUnit(anchor, `e${counter++}`);
    if (canPlace(anchor, c.shape, state, 'enemy')) state = placeUnit(unit, state);
  }

  for (const col of cols) {
    const anchor: CellCoord = { side: 'enemy', row: 1, col };
    if (state.occupancy.cellToUnitId.has(cellKey(anchor))) continue;
    if (candidates.backPool.length === 0) continue;
    const c = pickOne(rng, candidates.backPool);
    const unit = c.createUnit(anchor, `e${counter++}`);
    if (canPlace(anchor, c.shape, state, 'enemy')) state = placeUnit(unit, state);
  }

  return state;
}

export function replayPlaceEnemies(
  state:  BattleState,
  inputs: CreateUnitInstanceInput[],
): BattleState {
  for (const input of inputs) {
    const unit = createUnitInstance(input);
    if (canPlace(input.anchor, input.blueprint.shape, state, 'enemy')) {
      state = placeUnit(unit, state);
    }
  }
  return state;
}
