import type { CellCoord } from './gridTypes';

export type SkillPreviewHighlightKind = 'damage' | 'heal';

export type SkillPreviewHeaderColorKind = 'physical' | 'magical' | 'neutral';

export type SkillPreviewCell =
  | {
      coord: CellCoord;
      kind: 'skill';
      highlight: SkillPreviewHighlightKind;
      multiplier: number;
    }
  | {
      coord: CellCoord;
      kind: 'effect';
      highlight: SkillPreviewHighlightKind;
    };

export type SkillPreviewModel = {
  cells: SkillPreviewCell[];
  statusHeader: {
    text: string;
    colorKind: SkillPreviewHeaderColorKind;
  };
  statusLines: string[];
};
