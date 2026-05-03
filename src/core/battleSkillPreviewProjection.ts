import type { CellCoord } from '../shared/gridTypes';
import type { GamePhase } from './phases';
import { buildSkillPreviewModel } from '../battle/skillPreview';
import type { SkillPreviewModel } from '../shared/skillPreviewModel';

type BattlePhase = Extract<GamePhase, { type: 'battle' }>;

export function buildBattlePhaseSkillPreviewModel(input: {
  phase: BattlePhase;
  targetCoord: CellCoord;
}): SkillPreviewModel | null {
  return buildSkillPreviewModel({
    activeUnit: input.phase.activeUnit,
    targetCoord: input.targetCoord,
    occupancy: input.phase.occupancy,
    unitsById: input.phase.unitsById,
  });
}
