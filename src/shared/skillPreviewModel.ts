import type { CellCoord } from './gridTypes';

export type SkillPreviewHighlightKind = 'damage' | 'heal' | 'revive';

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

/**
 * Structured preview for a selected resurrection item. No display text: the battle domain
 * computes the target and HP, and `objects/battleSkillPreviewPresentation.ts` writes the wording.
 */
export type ItemRevivePreviewModel = {
  kind: 'item_revive';
  itemName: string;
  targetName: string;
  restoredHp: number;
  cells: SkillPreviewCell[];
};

/** What a manual target click previews: the active skill, or the item in targeting mode. */
export type BattleTargetPreviewModel =
  | ({ kind: 'skill' } & SkillPreviewModel)
  | ItemRevivePreviewModel;
