import Phaser from "phaser";
import { UI_THEME } from "./theme";

export abstract class BaseTooltip<T> extends Phaser.GameObjects.Container {
  protected bg:           Phaser.GameObjects.Rectangle;
  protected contentItems: Phaser.GameObjects.GameObject[] = [];

  constructor(
    scene: Phaser.Scene,
    protected readonly tooltipW: number,
    bgColor: number = UI_THEME.component.tooltip.bg,
    bgAlpha: number = 0,
  ) {
    super(scene, 0, 0);

    this.bg = scene.add.rectangle(0, 0, tooltipW, 20, bgColor, bgAlpha);
    this.bg.setOrigin(0, 0);
    this.add(this.bg);

    this.setDepth(UI_THEME.depth.tooltip);
    this.setVisible(false);
    scene.add.existing(this);
  }

  /**
   * Subclass populates this.contentItems and returns total content height.
   * Called once per show(). Previous content is destroyed automatically.
   */
  protected abstract buildContent(data: T): number;

  show(data: T, anchorX: number, anchorY: number, side: "left" | "right"): void {
    this.clearContent();
    const h = this.buildContent(data);
    this.bg.setSize(this.tooltipW, h);
    this.placeNear(anchorX, anchorY, h, side);
    this.setVisible(true);
  }

  hide(): void {
    this.setVisible(false);
  }

  protected clearContent(): void {
    for (const obj of this.contentItems) obj.destroy();
    this.contentItems = [];
  }

  /** Positions tooltip near anchor point, clamped to screen edges. */
  protected placeNear(
    anchorX: number,
    anchorY: number,
    h:       number,
    side:    "left" | "right",
    gapPx  = UI_THEME.component.tooltip.pad,
  ): void {
    const { width: sw, height: sh } = this.scene.scale;
    const w   = this.tooltipW;
    const pad = UI_THEME.component.tooltip.pad;

    let tx = side === "right" ? anchorX + gapPx : anchorX - w - gapPx;
    let ty = anchorY - h / 2;

    tx = Phaser.Math.Clamp(tx, pad, sw - w - pad);
    ty = Phaser.Math.Clamp(ty, pad, sh - h - pad);

    this.setPosition(tx, ty);
  }

  /** Convenience: add a text node as tracked content. */
  protected addText(
    x:     number,
    y:     number,
    text:  string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, text, style).setOrigin(0, 0);
    this.add(t);
    this.contentItems.push(t);
    return t;
  }

  /** Convenience: add a rectangle node as tracked content. */
  protected addRect(
    x:      number,
    y:      number,
    w:      number,
    h:      number,
    color:  number,
    alpha = 1,
  ): Phaser.GameObjects.Rectangle {
    const r = this.scene.add.rectangle(x, y, w, h, color, alpha).setOrigin(0, 0);
    this.add(r);
    this.contentItems.push(r);
    return r;
  }
}
