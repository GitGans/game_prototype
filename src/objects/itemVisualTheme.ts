export const ITEM_VISUAL_THEME = {
  cell: {
    bg:          0x2a2a3a,
    hoverBorder: 0xffffff,
    emptySlot:   "#555566",
  },

  slotTypeColors: {
    necklace:    0x3a5a7a,
    helmet:      0x7a4a4a,
    artifact:    0x5a3a7a,
    hand_left:   0x3a6a4a,
    armor:       0x4a4a6a,
    hand_right:  0x7a5a3a,
    ring_1:      0x3a7a7a,
    belt:        0x6a6a3a,
    ring_2:      0x3a7a7a,
    gloves:      0x5a5a4a,
    boots:       0x4a3a5a,
    activatable: 0x7a4a3a,
    default:     0x4a4a4a,
  } as Record<string, number>,

  equipmentPlaceholder: 0x4a4a6a,
} as const;
