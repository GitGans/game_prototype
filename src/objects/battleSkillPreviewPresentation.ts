import type {
  BattleTargetPreviewModel,
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

function formatPreviewBody(lines: readonly string[]): string {
  return `Preview:\n${lines.join('\n')}\n[click again to confirm]`;
}

/**
 * Formats every manual target-preview variant. The item variant arrives as structured data
 * (target, restored HP) — its wording lives here, not in the battle domain.
 */
export function buildBattleTargetPreviewPresentation(
  model: BattleTargetPreviewModel,
): BattleSkillPreviewPresentation {
  switch (model.kind) {
    case 'skill':
      return {
        cells: model.cells,
        statusHeader: model.statusHeader,
        statusBody: formatPreviewBody(model.statusLines),
      };

    case 'item_revive':
      return {
        cells: model.cells,
        statusHeader: { text: model.itemName, colorKind: 'neutral' },
        statusBody: formatPreviewBody([`${model.targetName} revived +${model.restoredHp} HP`]),
      };

    default: {
      const _exhaustive: never = model;
      throw new Error(`Unhandled target preview: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
