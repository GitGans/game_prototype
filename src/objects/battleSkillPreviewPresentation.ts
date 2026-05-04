import type {
  SkillPreviewModel,
  SkillPreviewHeaderColorKind,
} from '../shared/skillPreviewModel';

export type {
  SkillPreviewHeaderColorKind as BattleSkillPreviewHeaderColorKind,
  SkillPreviewHighlightKind as BattleSkillPreviewHighlightKind,
  SkillPreviewCell as BattleSkillPreviewCell,
} from '../shared/skillPreviewModel';

// ─── Public types ─────────────────────────────────────────────────────────────

export type BattleSkillPreviewPresentation = {
  cells: import('../shared/skillPreviewModel').SkillPreviewCell[];
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
