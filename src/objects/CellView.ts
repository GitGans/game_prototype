import Phaser from 'phaser';
import { CELL_SIZE, COLORS, LAYOUT_SCALE } from '../core/Constants';
import { CellCoord } from '../battle/types';
import { cellKey } from '../battle/field';

type HighlightType = 'none' | 'selected' | 'target' | 'heal_target';

export class CellView extends Phaser.GameObjects.Container {
  readonly coord: CellCoord;
  readonly key: string;

  private bg: Phaser.GameObjects.Rectangle;
  private border: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, coord: CellCoord) {
    super(scene, x, y);
    this.coord = coord;
    this.key = cellKey(coord);

    const borderThickness = Math.max(2, Math.round(2 * LAYOUT_SCALE));
    this.border = scene.add.rectangle(0, 0, CELL_SIZE, CELL_SIZE, COLORS.cellBorder);
    this.bg = scene.add.rectangle(0, 0, CELL_SIZE - borderThickness, CELL_SIZE - borderThickness, COLORS.cell);

    this.add([this.border, this.bg]);
    scene.add.existing(this);

    this.setInteractive(
      new Phaser.Geom.Rectangle(-CELL_SIZE / 2, -CELL_SIZE / 2, CELL_SIZE, CELL_SIZE),
      Phaser.Geom.Rectangle.Contains
    );
  }

  setHighlight(type: HighlightType): void {
    switch (type) {
      case 'selected':
        this.bg.setFillStyle(COLORS.cellSelected);
        break;
      case 'target':
        this.bg.setFillStyle(COLORS.validTarget);
        break;
      case 'heal_target':
        this.bg.setFillStyle(COLORS.validHeal);
        break;
      default:
        this.bg.setFillStyle(COLORS.cell);
    }
  }

  setHover(on: boolean): void {
    if (on) {
      this.bg.setFillStyle(COLORS.cellHover);
    } else {
      this.bg.setFillStyle(COLORS.cell);
    }
  }
}
