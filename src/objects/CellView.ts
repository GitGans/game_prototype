import Phaser from "phaser";
import { CELL_SIZE, COLORS, LAYOUT_SCALE } from "../core/Constants";
import { CellCoord } from "../battle/types";
import { cellKey } from "../battle/field";

type HighlightType = "none" | "selected" | "target" | "heal_target";
type CellMode = "placement" | "battle";

function lerpColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 0xff,
    g1 = (c1 >> 8) & 0xff,
    b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff,
    g2 = (c2 >> 8) & 0xff,
    b2 = c2 & 0xff;
  return (
    (Math.round(r1 + (r2 - r1) * t) << 16) |
    (Math.round(g1 + (g2 - g1) * t) << 8) |
    Math.round(b1 + (b2 - b1) * t)
  );
}

export class CellView extends Phaser.GameObjects.Container {
  readonly coord: CellCoord;
  readonly key: string;

  private bg: Phaser.GameObjects.Rectangle;
  private border: Phaser.GameObjects.Rectangle;
  private effectGfx: Phaser.GameObjects.Graphics;
  private _mode: CellMode = "placement";

  constructor(scene: Phaser.Scene, x: number, y: number, coord: CellCoord) {
    super(scene, x, y);
    this.coord = coord;
    this.key = cellKey(coord);

    const borderThickness = Math.max(2, Math.round(2 * LAYOUT_SCALE));
    this.border = scene.add.rectangle(
      0,
      0,
      CELL_SIZE,
      CELL_SIZE,
      COLORS.cellBorder,
    );
    this.bg = scene.add.rectangle(
      0,
      0,
      CELL_SIZE - borderThickness,
      CELL_SIZE - borderThickness,
      COLORS.cell,
    );
    this.effectGfx = scene.add.graphics();

    // Default placement alpha — semi-transparent
    this.border.setAlpha(0.4);
    this.bg.setAlpha(0.3);

    this.add([this.border, this.bg, this.effectGfx]);
    scene.add.existing(this);

    this.setInteractive(
      new Phaser.Geom.Rectangle(
        -CELL_SIZE / 2,
        -CELL_SIZE / 2,
        CELL_SIZE,
        CELL_SIZE,
      ),
      Phaser.Geom.Rectangle.Contains,
    );
  }

  setMode(mode: CellMode): void {
    this._mode = mode;
    if (mode === "battle") {
      this.border.setAlpha(0);
      this.bg.setAlpha(0);
    } else {
      this.border.setAlpha(0.4);
      this.bg.setAlpha(0.3);
    }
  }

  setHighlight(type: HighlightType): void {
    switch (type) {
      case "selected":
        this.bg.setFillStyle(COLORS.cellSelected).setAlpha(0.25);
        break;
      case "target":
        this.bg.setFillStyle(COLORS.validTarget).setAlpha(0.45);
        break;
      case "heal_target":
        this.bg.setFillStyle(COLORS.validHeal).setAlpha(0.25);
        break;
      default:
        // 'none': in battle keep cell invisible; in placement restore subtle tint
        if (this._mode === "battle") {
          this.bg.setAlpha(0);
        } else {
          this.bg.setFillStyle(COLORS.cell).setAlpha(0.3);
        }
    }
  }

  setHover(on: boolean): void {
    if (this._mode === "battle") return;
    if (on) {
      this.bg.setFillStyle(COLORS.cellHover).setAlpha(0.5);
    } else {
      this.bg.setFillStyle(COLORS.cell).setAlpha(0.3);
    }
  }

  setSkillPreview(multiplier: number, isHeal = false): void {
    const dim = isHeal ? 0x0a2a0a : 0x2a1a00;
    const bright = isHeal ? 0x44dd44 : 0xff8800;
    this.bg.setFillStyle(lerpColor(dim, bright, multiplier)).setAlpha(0.85);
  }

  setEffectPreview(isHeal: boolean): void {
    const color = isHeal ? COLORS.validHeal : COLORS.validTarget;
    const thickness = Math.max(2, Math.round(2 * LAYOUT_SCALE));
    const half = CELL_SIZE / 2;
    const inset = thickness / 2;
    this.effectGfx.clear();
    this.effectGfx.lineStyle(thickness, color, 1.0);
    this.effectGfx.strokeRect(
      -half + inset,
      -half + inset,
      CELL_SIZE - thickness,
      CELL_SIZE - thickness,
    );
  }

  clearEffectPreview(): void {
    this.effectGfx.clear();
  }
}
