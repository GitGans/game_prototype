export const BATTLE_VISUAL_THEME = {
  cell: {
    bg:          0x2a3a5a,
    border:      0x2a3f60,
    hover:       0x3a5a8a,
    selected:    0xffaa00,
    validTarget: 0xff4444,
    validHeal:   0x44dd44,
    skillPreview: {
      healDim:      0x0a2a0a,
      healBright:   0x44dd44,
      damageDim:    0x2a1a00,
      damageBright: 0xff8800,
    },
  },
  unit: {
    player:      0x4488ff,
    enemy:       0xff5544,
    dead:        0x333344,
    labelPlayer: "#aaddff",
    labelEnemy:  "#ffaaaa",
    textLight:   "#ffffff",
    textDark:    "#cccccc",
  },
  bench: {
    bg:       0x1a2a3a,
    hover:    0x2a3a4a,
    selected: 0x2a5a1a,
    empty:    0x0d1a26,
    // Intentionally differs from UI_THEME.color.hp — preserve bench visuals; revisit during visual polish.
    hpBg:     0x222233,
    hpFg:     0x44dd44,
  },
  skill: {
    magical:  "#89CFF0",
    physical: "#B0C4DE",
  },
} as const;
