import Phaser from 'phaser';
import { EquipmentSnapshot, ItemSlotSnapshot } from '../shared/snapshotTypes';
import { ItemTooltip } from './ItemTooltip';
import { ItemCell } from './ItemCell';
import type { ItemUsability } from '../shared/snapshotTypes';

const EQUIP_MATRIX: Array<Array<string | null>> = [
  ['necklace', 'helmet',    'artifact'   ],
  ['hand_left','armor',     'hand_right' ],
  ['ring_1',   'belt',      'ring_2'     ],
  ['gloves',   'boots',     'usable_slot'],
];

const SLOT_LABELS: Record<string, string> = {
  necklace:    'Necklace',
  helmet:      'Helmet',
  artifact:    'Artifact',
  hand_left:   'Shield',
  armor:       'Armor',
  hand_right:  'Weapon',
  ring_1:      'Ring',
  belt:        'Belt',
  ring_2:      'Ring',
  gloves:      'Gloves',
  boots:       'Boots',
  usable_slot: 'Usable',
};

export class EquipmentMatrix extends Phaser.GameObjects.Container {
  private cells: Partial<Record<string, ItemCell>> = {};

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    cellSize: number,
    gap: number,
    snapshot: EquipmentSnapshot,
    tooltip: ItemTooltip,
    onSlotClick: (slot: string, item: ItemSlotSnapshot | null) => void,
    onSlotDoubleClick: (slot: string, item: ItemSlotSnapshot) => void,
    /**
     * Item-use eligibility keyed by instance id — the equipped usable has a verdict too, so its cell
     * can explain why activation is unavailable exactly as a backpack cell does.
     */
    itemUsage: Record<string, ItemUsability> = {},
  ) {
    super(scene, x, y);

    EQUIP_MATRIX.forEach((row, ri) => {
      row.forEach((slot, ci) => {
        if (!slot) return;
        const cx = ci * (cellSize + gap);
        const cy = ri * (cellSize + gap);
        const item = snapshot.slots[slot] ?? null;

        const cell = new ItemCell({
          scene,
          x: x + cx,
          y: y + cy,
          size: cellSize,
          slotKey: slot,
          slotLabel: SLOT_LABELS[slot] ?? slot,
          item,
          tooltip,
          usage: item ? itemUsage[item.instanceId] ?? null : null,
          onClick: (it) => onSlotClick(slot, it),
          onDoubleClick: (it) => onSlotDoubleClick(slot, it),
        });
        this.cells[slot] = cell;
      });
    });

    scene.add.existing(this);
  }

  refresh(snapshot: EquipmentSnapshot, itemUsage: Record<string, ItemUsability> = {}): void {
    for (const [slot, cell] of Object.entries(this.cells)) {
      const item = snapshot.slots[slot] ?? null;
      cell?.refresh(item, item ? itemUsage[item.instanceId] ?? null : null);
    }
  }

  /** Every cell drops its deferred click — see `ItemCell.cancelPendingGesture`. */
  cancelPendingGestures(): void {
    for (const cell of Object.values(this.cells)) cell?.cancelPendingGesture();
  }
}
