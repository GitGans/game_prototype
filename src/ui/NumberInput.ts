import Phaser from 'phaser';
import { LAYOUT_SCALE } from '../core/Constants';
import { fontSize, VALUE_COLOR } from './theme';

export interface NumberInputConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
  width?: number;
  height?: number;
  min: number;
  max: number;
  initial?: number;
  onChange?: (value: number | null) => void;
}

export class NumberInput extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private valueText: Phaser.GameObjects.Text;
  private errorText: Phaser.GameObjects.Text;
  private raw: string;
  private cfg: NumberInputConfig;

  constructor(cfg: NumberInputConfig) {
    super(cfg.scene, cfg.x, cfg.y);
    this.cfg = cfg;
    this.raw = String(cfg.initial ?? cfg.min);

    const w = cfg.width  ?? Math.round(120 * LAYOUT_SCALE);
    const h = cfg.height ?? Math.round(48  * LAYOUT_SCALE);

    this.bg = cfg.scene.add.rectangle(0, 0, w, h, 0x222233)
      .setStrokeStyle(Math.round(2 * LAYOUT_SCALE), 0x6a6a8a);
    this.add(this.bg);

    this.valueText = cfg.scene.add.text(0, 0, this.raw, {
      fontSize: fontSize('lg'),
      color: VALUE_COLOR.white,
    }).setOrigin(0.5);
    this.add(this.valueText);

    this.errorText = cfg.scene.add.text(0, h / 2 + Math.round(6 * LAYOUT_SCALE), '', {
      fontSize: fontSize('sm'),
      color: VALUE_COLOR.negative,
    }).setOrigin(0.5, 0);
    this.add(this.errorText);

    cfg.scene.add.existing(this);
    cfg.scene.input.keyboard!.on('keydown', this.onKey, this);
    this.validate();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') {
      const next = this.raw === '0' ? e.key : this.raw + e.key;
      if (next.length <= String(this.cfg.max).length + 1) this.raw = next;
    } else if (e.key === 'Backspace') {
      this.raw = this.raw.slice(0, -1) || '0';
    }
    this.validate();
  };

  private validate(): void {
    const n = parseInt(this.raw, 10);
    this.valueText.setText(this.raw);
    if (isNaN(n) || n < this.cfg.min) {
      this.errorText.setText(`Min: ${this.cfg.min}`);
      this.bg.setStrokeStyle(Math.round(2 * LAYOUT_SCALE), 0x8a3a3a);
      this.cfg.onChange?.(null);
    } else if (n > this.cfg.max) {
      this.errorText.setText(`Max: ${this.cfg.max}`);
      this.bg.setStrokeStyle(Math.round(2 * LAYOUT_SCALE), 0x8a3a3a);
      this.cfg.onChange?.(null);
    } else {
      this.errorText.setText('');
      this.bg.setStrokeStyle(Math.round(2 * LAYOUT_SCALE), 0x3a8a3a);
      this.cfg.onChange?.(n);
    }
  }

  getValue(): number | null {
    const n = parseInt(this.raw, 10);
    return isNaN(n) || n < this.cfg.min || n > this.cfg.max ? null : n;
  }

  destroy(fromScene?: boolean): void {
    this.cfg.scene.input.keyboard?.off('keydown', this.onKey, this);
    super.destroy(fromScene);
  }
}
