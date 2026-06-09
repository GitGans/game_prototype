import type { CellCoord } from '../shared/gridTypes';
import type { UnitDeployment } from '../shared/unitDeploymentTypes';
import type { GamePhase } from './phases';
import type { BattleUnitSnapshot } from '../shared/battleSnapshots';
import { buildSkillPreviewModel, type SkillPreviewUnit } from '../battle/skillPreview';
import type { SkillPreviewModel } from '../shared/skillPreviewModel';

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

export function buildBattlePhaseSkillPreviewModel(input: {
  phase: BattlePhase;
  targetCoord: CellCoord;
}): SkillPreviewModel | null {
  const { phase } = input;

  const deployments = new Map<string, UnitDeployment>(
    [...phase.unitsById].map(([id, unit]) => [id, unit.deployment] as const),
  );
  const unitsById = new Map<string, SkillPreviewUnit>(
    [...phase.unitsById].map(([id, unit]) => [id, toSkillPreviewUnit(unit)] as const),
  );
  const activeUnit = phase.activeUnit ? toSkillPreviewUnit(phase.activeUnit) : null;

  return buildSkillPreviewModel({
    activeUnit,
    targetCoord: input.targetCoord,
    occupancy: phase.occupancy,
    unitsById,
    deployments,
  });
}
