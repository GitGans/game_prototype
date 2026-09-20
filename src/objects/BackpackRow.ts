import Phaser from "phaser";
import { BackpackSnapshot, ItemSlotSnapshot } from "../shared/snapshotTypes";
import { ItemTooltip } from "./ItemTooltip";
import { ItemCell } from "./ItemCell";
import type { ItemUsability } from "../shared/snapshotTypes";

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
    onItemClick: (item: ItemSlotSnapshot) => void,
    onItemDoubleClick: (item: ItemSlotSnapshot) => void,
    cols: number = 5,
    rows: number = 2,
    /** Item-use eligibility keyed by instance id, forwarded to each cell for its tooltip. */
    itemUsage: Record<string, ItemUsability> = {},
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

      const cell = new ItemCell({
        scene,
        x: x + cx,
        y: y + cy,
        size: cellSize,
        slotKey: String(i),
        slotLabel: "",
        item,
        tooltip,
        usage: item ? itemUsage[item.instanceId] ?? null : null,
        onClick: (it) => {
          if (it) onItemClick(it);
        },
        onDoubleClick: (it) => onItemDoubleClick(it),
      });
      this.cells.push(cell);
    }

    scene.add.existing(this);
  }

  refresh(
    snapshot: BackpackSnapshot,
    itemUsage: Record<string, ItemUsability> = {},
  ): void {
    this.cells.forEach((cell, i) => {
      const item = snapshot.slots[i] ?? null;
      cell.refresh(item, item ? itemUsage[item.instanceId] ?? null : null);
    });
  }

  /** Every cell drops its deferred click — see `ItemCell.cancelPendingGesture`. */
  cancelPendingGestures(): void {
    for (const cell of this.cells) cell.cancelPendingGesture();
  }
}
