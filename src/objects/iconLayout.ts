import { scaled } from "../ui/layout";

/**
 * Game-UI icon layout tokens (sizes & spacing) shared by item cells, skill rows,
 * and upgrade cards. Object-level layout — not in ui/theme (which holds only
 * generic visual tokens) and not in *VisualTheme.ts (which holds raw colors).
 */
export const OBJECT_ICON_LAYOUT = {
  // Standard skill-row cell
  standardCellSize:      scaled(56),
  standardCellGap:       scaled(6),
  standardLabelOffsetX:  scaled(8),
  skillTooltipW:         scaled(140),

  // Upgrade card
  upgradeSkillIconSize:   scaled(36),
  upgradeUnitPreviewSize: scaled(48),
  upgradeCardPad:         scaled(8),
  upgradeCardGap:         scaled(4),

  // Shared inset for textured icons (texture drawn at size - inset*2)
  iconInset: scaled(2),
} as const;
