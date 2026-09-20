// Revive owns the resurrection chokepoints, shared by skills AND equipped items:
//   - computeReviveHpFromPercent:   THE HP formula (maxHp × percent, ceil, ≥ 1)
//   - reviveUnitInBattleByPercent:  THE BattleState-level mutation
//   - resolveReviveTargetsForAction: pure skill target resolution from structural maps
// Skills resolve their level to a percent first (computeReviveHp / reviveUnitInBattle are thin
// wrappers); items pass their authored `hpPercent` directly — scroll strength is never a skill
// level. All corpse geometry routes through deadFriendlyTargeting.ts — duplicating the
// deployment+shape walk is forbidden.

import type { BattleState, Unit } from './types';
import type { CellCoord, Side } from '../shared/gridTypes';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';
import type { EffectAreaPatternRef, ReviveEffect } from './skillUsePlan';
import {
  getDeadFriendlyCorpseCells,
  type DeadFriendlyTargetUnit,
} from './deadFriendlyTargeting';
import { cellKey } from './field';
import { isDead, reviveUnit } from './lifeState';
import { buildOccupancy } from './occupancy';
import { resolvePlanPattern } from './skillPlanPatterns';
import { resolvePattern } from './skillPatterns';
import { getReviveHpPercent } from './skillDefinitionRuntime';

export type ReviveHpReadable = Pick<Unit, 'maxHp'>;

// Aliased so revive code reads with revive-domain vocabulary. The structural
// shape is unchanged from Stage 1's DeadFriendlyTargetUnit.
export type ReviveResolutionUnit = DeadFriendlyTargetUnit;

// THE resurrection HP formula, for skills and items alike: target maxHp × percent,
// rounded up, never below 1. Does NOT use caster power. Does NOT consume matrix multipliers.
export function computeReviveHpFromPercent(
  unit: ReviveHpReadable,
  hpPercent: number,
): number {
  return Math.max(1, Math.ceil((unit.maxHp * hpPercent) / 100));
}

// Skill path: the level resolves to a percent, then shares the formula above.
export function computeReviveHp(
  unit: ReviveHpReadable,
  revive: ReviveEffect,
): number {
  return computeReviveHpFromPercent(unit, getReviveHpPercent(revive));
}

// Skill path wrapper: the level resolves to a percent, then shares the chokepoint below.
export function reviveUnitInBattle(
  state: BattleState,
  unitId: string,
  revive: ReviveEffect,
): { state: BattleState; hpRestored: number } | null {
  return reviveUnitInBattleByPercent(state, unitId, getReviveHpPercent(revive));
}

// THE BattleState-level revive mutation chokepoint. Returns null when the unit is
// missing, not dead, or not field-deployed. roundQueue is intentionally reused
// by reference — resurrection itself never touches the current round's queue.
export function reviveUnitInBattleByPercent(
  state: BattleState,
  unitId: string,
  hpPercent: number,
): { state: BattleState; hpRestored: number } | null {
  const unit = state.units.get(unitId);
  if (!unit) return null;
  if (!isDead(unit)) return null;

  const deployment = state.deployments.get(unitId);
  if (!deployment || deployment.kind !== 'field') return null;

  const hpRestored = computeReviveHpFromPercent(unit, hpPercent);
  const revivedUnit = reviveUnit(unit, hpRestored);

  const nextUnits = new Map(state.units);
  nextUnits.set(unitId, revivedUnit);

  const nextState: BattleState = {
    ...state,
    units: nextUnits,
    occupancy: buildOccupancy(nextUnits, state.deployments),
    // roundQueue intentionally reused unchanged — revive does not enter current round.
  };

  return { state: nextState, hpRestored };
}

export interface ReviveResolutionInput {
  units: ReadonlyMap<string, ReviveResolutionUnit>;
  deployments: ReadonlyMap<string, UnitDeployment>;
  casterSide: Side;
  targetAnchor: CellCoord;
  matrix: EffectAreaPatternRef;
}

// Resolves which dead friendly corpses are hit by an effect-area matrix anchored
// at targetAnchor. Returns:
//   targets[].unit  — structural snapshot (NOT full Unit)
//   targets[].cells — full body cells of the corpse from deployment + shape
//   affectedCells   — raw matrix-resolved cells; includes cells that don't revive
//                     anyone. Useful for diagnostics/tests; NOT for preview
//                     highlight. Stage 3 preview must highlight targets[].cells.
//
// Matrix multipliers from resolvePattern are intentionally ignored — revive uses
// shape only.
export function resolveReviveTargetsForAction(input: ReviveResolutionInput): {
  targets: Array<{ unit: ReviveResolutionUnit; cells: CellCoord[] }>;
  affectedCells: CellCoord[];
} {
  const pattern = resolvePlanPattern(input.matrix);
  const affectedCells = resolvePattern(input.targetAnchor, pattern);

  const corpseCellToUnit = new Map<string, ReviveResolutionUnit>();
  const corpseCellsByUnitId = new Map<string, CellCoord[]>();

  for (const { unit, cell } of getDeadFriendlyCorpseCells({
    units: input.units,
    deployments: input.deployments,
    casterSide: input.casterSide,
  })) {
    corpseCellToUnit.set(cellKey(cell), unit);

    const cells = corpseCellsByUnitId.get(unit.id);
    if (cells) {
      cells.push(cell);
    } else {
      corpseCellsByUnitId.set(unit.id, [cell]);
    }
  }

  const byUnitId = new Map<
    string,
    { unit: ReviveResolutionUnit; cells: CellCoord[] }
  >();

  for (const hit of affectedCells) {
    const unit = corpseCellToUnit.get(cellKey(hit.coord));
    if (!unit) continue;
    if (byUnitId.has(unit.id)) continue;

    byUnitId.set(unit.id, {
      unit,
      cells: corpseCellsByUnitId.get(unit.id) ?? [],
    });
  }

  return {
    targets: Array.from(byUnitId.values()),
    affectedCells: affectedCells.map((hit) => hit.coord),
  };
}
