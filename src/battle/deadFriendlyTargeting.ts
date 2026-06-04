import type { CellCoord, Side } from '../shared/gridTypes';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';
import type { Unit } from './types';
import { isDead } from './lifeState';
import { getOccupiedCells } from './shapes';

// Structural snapshot of a dead corpse. Includes fields Stage 2 / Stage 3 will
// need so the same lookup feeds targeting, revive execution, and preview
// without per-stage churn:
//   - id      → reviveUnitInBattle(state, unitId)
//   - name    → unit_revived event / presentation
//   - maxHp   → computeReviveHp(maxHp, levelPercent)
//   - hp, lifeState, side, shape → required for the walk itself
export type DeadFriendlyTargetUnit = Pick<
  Unit,
  'id' | 'name' | 'side' | 'hp' | 'lifeState' | 'maxHp' | 'shape'
>;

export type DeadFriendlyCorpseCell = {
  unit: DeadFriendlyTargetUnit;
  cell: CellCoord;
};

// Single source of truth for "what cells does a dead friendly corpse occupy".
// Accepts structural maps rather than BattleState so preview code (Stage 3)
// and tests can call it without constructing a full battle.
//
// Contract (load-bearing for Stage 2/3): every caller must supply a real
// deployments map. The deployment anchor is the only valid source for
// corpse-cell geometry. fieldUnitCells, occupancy maps, or any reverse-derived
// cell list must not be used as a substitute for deployment + shape.
export function getDeadFriendlyCorpseCells(input: {
  units: ReadonlyMap<string, DeadFriendlyTargetUnit>;
  deployments: ReadonlyMap<string, UnitDeployment>;
  casterSide: Side;
}): DeadFriendlyCorpseCell[] {
  const { units, deployments, casterSide } = input;
  const result: DeadFriendlyCorpseCell[] = [];

  for (const [unitId, unit] of units) {
    if (unit.side !== casterSide) continue;
    if (!isDead(unit)) continue;

    const deployment = deployments.get(unitId);
    if (!deployment || deployment.kind !== 'field') continue;

    for (const cell of getOccupiedCells(deployment.anchor, unit.shape)) {
      result.push({ unit, cell });
    }
  }

  return result;
}
