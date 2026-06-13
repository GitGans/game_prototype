export const BATTLE_VISUAL_THEME = {
  cell: {
    bg:          0x2a3a5a,
    border:      0x2a3f60,
    hover:       0x3a5a8a,
    selected:    0xffaa00,
    validTarget: 0xff4444,
    validHeal:   0x44dd44,
    validRevive: 0x66ddee,
    skillPreview: {
      healDim:      0x0a2a0a,
      healBright:   0x44dd44,
      damageDim:    0x2a1a00,
      damageBright: 0xff8800,
      reviveDim:    0x0a2a2a,
      reviveBright: 0x66ddee,
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
    deadTint:    0x888888,
    textStroke:  '#000000',
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

  log: {
    bg:       0xd8d8d8,
    positive: "#1a8c1a",
    negative: "#aa2222",
    neutral:  "#555555",
    btn:      "#333333",
  },

  initiative: {
    divider: 0x8899bb,
  },

  endOverlay: {
    titleVictory: "#ffdd44",
    titleDefeat:  "#ff4444",
    titleStroke:  "#000000",
  },

  resultCard: {
    bg:       0x1a1a2e,
    border:   0x44445a,
    fallback: 0x556677,
  },

  skillIconRow: {
    cellBg:       0x2a2a3a,
    cellFallback: 0x666666,
    cellBorder:   0x556677,
    labelColor:   "#cccccc",
  },

  skillBar: {
    activeBase:     0xffcc00,
    activeHover:    0xffdd44,
    activeStroke:   0xffffff,
    inactiveStroke: 0x888888,
  },

  floatingText: {
    damage: "#ff4444",
    heal:   "#44dd44",
    stroke: "#000000",
  },

  skillCellTooltip: {
    physical: "#ff6666",
    magical:  "#6699ff",
  },

  upgradeCard: {
    bg:              0x1a1a2e,
    borderChosen:    0xffdd44,
    borderAvailable: 0x44aa44,
    borderLocked:    0x445566,
    hoverBg:         0x6a6a8a,
  },

  unitPortrait: {
    dimmedTint: 0xaaaaaa,
    normalTint: 0xffffff,
  },
} as const;
