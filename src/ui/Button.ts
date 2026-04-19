import Phaser from "phaser";
import { BTN, BtnStyle, ALPHA, fontSize, FONT_SIZE } from "./theme";

export interface ButtonConfig {
  scene:    Phaser.Scene;
  x:        number;
  y:        number;
  w:        number;
  h:        number;
  label:    string;
  style:    BtnStyle;
  onClick:  () => void;
  /** If true, button starts semi-transparent (e.g. "waiting for turn start"). */
  idle?:    boolean;
  /** Override font size token. Defaults to "md". */
  fontKey?: keyof typeof FONT_SIZE;
}

export class Button extends Phaser.GameObjects.Container {
  private bg:        Phaser.GameObjects.Rectangle;
  private txt:       Phaser.GameObjects.Text;
  private _idle:     boolean;
  private _disabled  = false;

  constructor(cfg: ButtonConfig) {
    super(cfg.scene, cfg.x, cfg.y);

    const colors = BTN[cfg.style];
    this._idle = cfg.idle ?? false;

    this.bg = cfg.scene.add.rectangle(0, 0, cfg.w, cfg.h, colors.base);
    this.txt = cfg.scene.add.text(0, 0, cfg.label, {
      fontSize:  fontSize(cfg.fontKey ?? "md"),
      color:     "#ffffff",
      fontStyle: "bold",
      align:     "center",
    }).setOrigin(0.5);

    this.add([this.bg, this.txt]);
    this.setSize(cfg.w, cfg.h);
    this.setInteractive({ useHandCursor: true });
    this.setAlpha(this._idle ? ALPHA.idle : ALPHA.active);

    this.on("pointerover", () => {
      if (this._disabled) return;
      this.bg.setFillStyle(colors.hover);
      this.setAlpha(ALPHA.hover);
    });
    this.on("pointerout", () => {
      if (this._disabled) return;
      this.bg.setFillStyle(colors.base);
      this.setAlpha(this._idle ? ALPHA.idle : ALPHA.active);
    });
    this.on("pointerup", () => {
      if (this._disabled) return;
      cfg.onClick();
    });

    cfg.scene.add.existing(this);
  }

  setDisabled(on: boolean): this {
    this._disabled = on;
    this.setAlpha(on ? ALPHA.disabled : ALPHA.active);
    if (this.input) this.input.cursor = on ? "default" : "pointer";
    return this;
  }

  /** Switch the button into "idle/waiting" alpha (e.g. before turn starts). */
  setIdle(on: boolean): this {
    this._idle = on;
    if (!this._disabled) this.setAlpha(on ? ALPHA.idle : ALPHA.active);
    return this;
  }

  setLabel(text: string): this {
    this.txt.setText(text);
    return this;
  }
}
