import Phaser from 'phaser';
import { HP_COLOR } from './theme';

export interface HpBarConfig {
  scene:     Phaser.Scene;
  x:         number;
  y:         number;
  width:     number;
  height:    number;
  ratio:     number;   // 0..1
  alpha?:    number;
  tricolor?: boolean;  // true = green/yellow/red by ratio; false = fixed green
}

export class HpBar extends Phaser.GameObjects.Container {
  private bg:   Phaser.GameObjects.Rectangle;
  private fill: Phaser.GameObjects.Rectangle;
  private readonly barW: number;
  private readonly barH: number;
  private readonly tricolor: boolean;

  constructor(cfg: HpBarConfig) {
    super(cfg.scene, cfg.x, cfg.y);
    this.barW = cfg.width;
    this.barH = cfg.height;
    this.tricolor = cfg.tricolor ?? false;
    const a = cfg.alpha ?? 1;

    this.bg   = cfg.scene.add.rectangle(0, 0, this.barW, this.barH, HP_COLOR.bg, a);
    this.fill = cfg.scene.add.rectangle(-this.barW / 2, 0, this.barW, this.barH, HP_COLOR.high, a)
      .setOrigin(0, 0.5);
    this.add([this.bg, this.fill]);

    this.setRatio(cfg.ratio, a);
    cfg.scene.add.existing(this);
  }

  setRatio(ratio: number, alpha = 1): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    const fillW   = Math.round(this.barW * clamped);

    this.bg.setAlpha(alpha);

    if (fillW <= 0) {
      this.fill.setVisible(false);
      return;
    }

    const color = this.tricolor
      ? (clamped > 0.5 ? HP_COLOR.high : clamped > 0.25 ? HP_COLOR.medium : HP_COLOR.low)
      : HP_COLOR.high;

    this.fill
      .setVisible(true)
      .setDisplaySize(fillW, this.barH)
      .setFillStyle(color)
      .setAlpha(alpha);
  }
}
