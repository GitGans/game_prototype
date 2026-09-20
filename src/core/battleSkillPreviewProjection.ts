import type { CellCoord } from '../shared/gridTypes';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';
import type { GamePhase } from './phases';
import type { BattleUnitSnapshot } from '../shared/battleSnapshots';
import { buildSkillPreviewModel, type SkillPreviewUnit } from '../battle/skillPreview';
import { resolveBattleItemPreview } from '../battle/itemPreview';
import type { BattleTargetPreviewModel } from '../shared/skillPreviewModel';

type BattlePhase = Extract<GamePhase, { type: 'battle' }>;

function toSkillPreviewUnit(unit: BattleUnitSnapshot): SkillPreviewUnit {
  const s = unit.statDisplay;
  return {
    id: unit.id,
    name: unit.name,
    side: unit.side,
    lifeState: unit.lifeState,
    hp: unit.currentHp,            // scene-facing currentHp → battle-layer hp (the rename boundary)
    maxHp: unit.maxHp,
    shape: unit.shape,
    effectiveStats: {
      physicalStrength: s.physicalStrength.value,
      magicalStrength:  s.magicalStrength.value,
      physicalDefense:  s.physicalDefense.value,
      magicalDefense:   s.magicalDefense.value,
      dodge:            s.dodge.value,
      block:            s.block.value,
      initiative:       s.initiative.value,
    },
    skills: unit.skills,
    activeSkillIndex: unit.activeSkillIndex,
  };
}

/**
 * The preview for a manual target click, derived only from committed `GamePhase` data: the item in
 * targeting mode when there is one (its target cells own `validTargets`), otherwise the active
 * skill. Returns structured data only — wording is `objects/battleSkillPreviewPresentation.ts`.
 */
export function buildBattlePhaseTargetPreviewModel(input: {
  phase: BattlePhase;
  targetCoord: CellCoord;
}): BattleTargetPreviewModel | null {
  const { phase } = input;

  const deployments = new Map<string, UnitDeployment>(
    [...phase.unitsById].map(([id, unit]) => [id, unit.deployment] as const),
  );
  const unitsById = new Map<string, SkillPreviewUnit>(
    [...phase.unitsById].map(([id, unit]) => [id, toSkillPreviewUnit(unit)] as const),
  );
  const activeUnit = phase.activeUnit ? toSkillPreviewUnit(phase.activeUnit) : null;

  const selectedItem = phase.activeUnitActions.find(
    a => a.kind === 'item' && a.instanceId === phase.selectedUsableInstanceId,
  );
  if (selectedItem?.kind === 'item') {
    if (!activeUnit) return null;
    const preview = resolveBattleItemPreview({
      effect: selectedItem.effect,
      ownerSide: activeUnit.side,
      targetCoord: input.targetCoord,
      units: unitsById,
      deployments,
    });
    if (!preview) return null;
    return {
      kind: 'item_revive',
      itemName: selectedItem.label,
      targetName: preview.targetName,
      restoredHp: preview.restoredHp,
      cells: preview.cells.map(coord => ({ coord, kind: 'effect', highlight: 'revive' })),
    };
  }

  const model = buildSkillPreviewModel({
    activeUnit,
    targetCoord: input.targetCoord,
    occupancy: phase.occupancy,
    unitsById,
    deployments,
  });
  return model ? { kind: 'skill', ...model } : null;
}
