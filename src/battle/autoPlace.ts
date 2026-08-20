import type { BattleState, Unit } from './types';
import type { Rng }                              from '../shared/random';
import { pickOne }                               from '../shared/random';
import type { CellCoord, Col, Row, UnitShape }   from '../shared/gridTypes';
import type { UnitDeployment }                   from '../shared/unitDeploymentTypes';
import type { RowTrait, UnitLifeState }          from '../shared/unitTypes';
import { canPlace, addFieldUnit, addBenchUnit }  from './placement';
import { getFreeBenchSlot }                      from './deployment';
import { cellKey }                               from './field';
import { createUnitInstance }                    from './unitFactory';
import type { CreateUnitInstanceInput }          from './unitFactory';

// ─── Candidate Contracts ─────────────────────────────────────────────────────

export interface PlayerPlacementCandidate {
  templateId:       string;
  shape:            UnitShape;
  rowTrait:         RowTrait;
  savedAnchor:      CellCoord | null;
  initialLifeState: UnitLifeState;    // drives living-first placement order
  createUnit:       (id: string) => Unit; // no anchor; deployment is assigned separately
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

/** One player unit's deployment as chosen at battle start. */
export interface PlayerInitialPlacement {
  templateId: string;
  unitId:     string;
  deployment: UnitDeployment;
}

export interface AutoPlacePlayerResult {
  state:      BattleState;
  placements: PlayerInitialPlacement[];
}

export function autoPlacePlayer(
  state:          BattleState,
  candidates:     readonly PlayerPlacementCandidate[],
  benchSlotCount: number,
): AutoPlacePlayerResult {
  state = { ...state, benchSlotCount };

  let counter = 1;
  const placed = new Map<string, PlayerInitialPlacement>();

  const tryField = (c: PlayerPlacementCandidate): boolean => {
    const anchors: CellCoord[] = [];
    if (c.savedAnchor) anchors.push(c.savedAnchor);
    const rows: Row[] = c.rowTrait === 'front' ? [0, 1] : [1, 0];
    for (const row of rows) {
      for (const col of [0, 1, 2] as Col[]) anchors.push({ side: 'player', row, col });
    }

    for (const anchor of anchors) {
      if (!canPlace(anchor, c.shape, state, 'player')) continue;
      const unitId = `p${counter++}`;
      state = addFieldUnit(state, c.createUnit(unitId), anchor);
      placed.set(c.templateId, {
        templateId: c.templateId,
        unitId,
        deployment: { kind: 'field', anchor: { ...anchor } },
      });
      return true;
    }
    return false;
  };

  const tryBench = (c: PlayerPlacementCandidate): boolean => {
    const slot = getFreeBenchSlot(state);
    if (slot === null) return false;
    const unitId = `p${counter++}`;
    state = addBenchUnit(state, c.createUnit(unitId), slot);
    placed.set(c.templateId, {
      templateId: c.templateId,
      unitId,
      deployment: { kind: 'bench', slot },
    });
    return true;
  };

  // Living-first: corpses must never push a living combatant onto the bench,
  // because combat cannot begin without a living player unit on the field.
  const processingOrder = [
    ...candidates.filter(c => c.initialLifeState === 'alive'),
    ...candidates.filter(c => c.initialLifeState !== 'alive'),
  ];

  for (const c of processingOrder) {
    if (tryField(c)) continue;
    if (tryBench(c)) continue;
    throw new Error(
      `autoPlacePlayer: no field or bench slot for "${c.templateId}". ` +
      `Player units are 1x1 and ${candidates.length} candidates were supplied; ` +
      `party-size validation must run before battle setup.`,
    );
  }

  // Records follow the ORIGINAL candidate order, not the living-first
  // processing order, so participants and battle results stay canonical.
  const placements = candidates.map(c => {
    const record = placed.get(c.templateId);
    if (!record) throw new Error(`autoPlacePlayer: missing placement record for "${c.templateId}"`);
    return record;
  });

  return { state, placements };
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
