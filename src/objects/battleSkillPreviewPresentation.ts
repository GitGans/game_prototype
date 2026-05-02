import type { CellCoord } from '../shared/gridTypes';
import type {
  SkillPreviewModel,
  SkillPreviewHeaderColorKind,
} from '../shared/skillPreviewModel';

// Re-export under the old name so BattlePresentationController import stays unchanged.
export type {
  SkillPreviewHeaderColorKind as BattleSkillPreviewHeaderColorKind,
} from '../shared/skillPreviewModel';

// ─── Public types ─────────────────────────────────────────────────────────────

export type BattleSkillPreviewHighlightKind = 'damage' | 'heal';

export type BattleSkillPreviewCell =
  | {
      coord: CellCoord;
      kind: 'skill';
      highlight: BattleSkillPreviewHighlightKind;
      multiplier: number;
    }
  | {
      coord: CellCoord;
      kind: 'effect';
      highlight: BattleSkillPreviewHighlightKind;
    };

export type BattleSkillPreviewPresentation = {
  cells: BattleSkillPreviewCell[];
  statusHeader: {
    text: string;
    colorKind: SkillPreviewHeaderColorKind;
  };
  statusBody: string;
};

// ─── Public function ──────────────────────────────────────────────────────────

export function buildBattleSkillPreviewPresentation(
  model: SkillPreviewModel,
): BattleSkillPreviewPresentation {
  return {
    cells: model.cells,
    statusHeader: model.statusHeader,
    statusBody: `Preview:\n${model.statusLines.join('\n')}\n[click again to confirm]`,
  };
}
