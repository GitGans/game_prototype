import Phaser from 'phaser';
import { BackpackSnapshot, ItemSlotSnapshot } from '../battle/types';
import { ItemTooltip } from './ItemTooltip';
import { ItemCell } from './ItemCell';

export class BackpackRow extends Phaser.GameObjects.Container {
  private cells: ItemCell[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    cellSize: number,
    gap: number,
    snapshot: BackpackSnapshot,
    tooltip: ItemTooltip,
    onItemClick: (item: ItemSlotSnapshot, cellX: number, cellY: number) => void,
    cols: number = 5,
    rows: number = 2,
  ) {
    super(scene, x, y);

    const COLS = cols;
    const total = cols * rows;
    for (let i = 0; i < total; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = col * (cellSize + gap);
      const cy = row * (cellSize + gap);
      const item = snapshot.slots[i] ?? null;

      const cellWorldX = x + cx;
      const cellWorldY = y + cy;

      const cell = new ItemCell({
        scene,
        x: cx,
        y: cy,
        size: cellSize,
        slotKey: String(i),
        slotLabel: String(i + 1),
        item,
        tooltip,
        onClick: (it) => {
          if (it) onItemClick(it, cellWorldX + cellSize / 2, cellWorldY + cellSize / 2);
        },
      });
      this.add(cell);
      this.cells.push(cell);
    }

    scene.add.existing(this);
  }

  refresh(snapshot: BackpackSnapshot): void {
    this.cells.forEach((cell, i) => {
      cell.refresh(snapshot.slots[i] ?? null);
    });
  }
}
