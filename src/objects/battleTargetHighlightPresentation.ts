import { BATTLE_VISUAL_THEME } from './battleVisualTheme';

export type BattleTargetHighlightKind = 'target' | 'heal_target' | 'revive_target' | 'none';

/** Single source of truth for the main-target highlight color, shared by the battlefield
 *  cells and the initiative bar. */
export function battleTargetHighlightColor(kind: BattleTargetHighlightKind): number | null {
  switch (kind) {
    case 'target':        return BATTLE_VISUAL_THEME.cell.validTarget;
    case 'heal_target':   return BATTLE_VISUAL_THEME.cell.validHeal;
    case 'revive_target': return BATTLE_VISUAL_THEME.cell.validRevive;
    case 'none':          return null;
  }
}
