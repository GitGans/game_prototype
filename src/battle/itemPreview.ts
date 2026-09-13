import type { CellCoord, Side } from '../shared/gridTypes';
import type { ReadonlyItemUseEffect } from '../shared/itemTypes';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';
import {
  getDeadFriendlyCorpseCells,
  type DeadFriendlyTargetUnit,
} from './deadFriendlyTargeting';
import { cellKey } from './field';
import { computeReviveHpFromPercent } from './revive';

/**
 * Preview computation for an equipped item in targeting mode. Pure and read-only, and it returns
 * DATA ONLY — the target, the restored HP and the affected cells. All display wording belongs to
 * `objects/battleSkillPreviewPresentation.ts`.
 *
 * Takes structural maps rather than BattleState so the scene-facing adapter can call it from
 * committed snapshot data. Corpse geometry comes from the dead-friendly walker and HP from the
 * shared percentage formula, so the preview and execution cannot disagree.
 */

/** Calculated outcome of confirming a targeted item on a cell. */
export type BattleItemPreview = {
  readonly type: 'revive';
  readonly targetUnitId: string;
  readonly targetName: string;
  readonly restoredHp: number;
  /** The corpse's full body. */
  readonly cells: readonly CellCoord[];
};

/** Null when the effect has no target preview, or the cell holds no dead ally on the field. */
export function resolveBattleItemPreview(input: {
  effect: ReadonlyItemUseEffect;
  ownerSide: Side;
  targetCoord: CellCoord;
  units: ReadonlyMap<string, DeadFriendlyTargetUnit>;
  deployments: ReadonlyMap<string, UnitDeployment>;
}): BattleItemPreview | null {
  if (input.effect.type !== 'revive') return null;

  const corpseCells = getDeadFriendlyCorpseCells({
    units: input.units,
    deployments: input.deployments,
    casterSide: input.ownerSide,
  });
  const targetKey = cellKey(input.targetCoord);
  const hit = corpseCells.find(c => cellKey(c.cell) === targetKey);
  if (!hit) return null;

  return {
    type: 'revive',
    targetUnitId: hit.unit.id,
    targetName: hit.unit.name,
    restoredHp: computeReviveHpFromPercent(hit.unit, input.effect.hpPercent),
    cells: corpseCells.filter(c => c.unit.id === hit.unit.id).map(c => c.cell),
  };
}
