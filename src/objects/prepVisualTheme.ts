export const PREP_VISUAL_THEME = {
  actionTile: {
    camp:  0x5a3a1a,
    shop:  0x1a3a5a,
    party: 0x3a1a5a,
  },
} as const;

export type PrepActionTileStyle = keyof typeof PREP_VISUAL_THEME.actionTile;
