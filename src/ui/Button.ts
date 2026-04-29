import Phaser from "phaser";
import { UI_THEME, BtnStyle, fontSize, FONT_SIZE } from "./theme";

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
  /** If false, disabled state blocks clicks without changing alpha. Defaults to true. */
  dimWhenDisabled?: boolean;
}

export class Button extends Phaser.GameObjects.Container {
  private bg:        Phaser.GameObjects.Rectangle;
  private txt:       Phaser.GameObjects.Text;
  private _idle:     boolean;
  private _disabled  = false;
  private colors:    { base: number; hover: number };
  private readonly dimWhenDisabled: boolean;

  constructor(cfg: ButtonConfig) {
    super(cfg.scene, cfg.x, cfg.y);

    this.colors = UI_THEME.component.button[cfg.style];
    this._idle = cfg.idle ?? false;
    this.dimWhenDisabled = cfg.dimWhenDisabled ?? true;

    this.bg = cfg.scene.add.rectangle(0, 0, cfg.w, cfg.h, this.colors.base);
    this.txt = cfg.scene.add.text(0, 0, cfg.label, {
      fontSize:  fontSize(cfg.fontKey ?? "md"),
      color:     UI_THEME.color.value.white,
      fontStyle: "bold",
      align:     "center",
    }).setOrigin(0.5);

    this.add([this.bg, this.txt]);
    this.setSize(cfg.w, cfg.h);
    this.setInteractive({ useHandCursor: true });
    this.setAlpha(this._idle ? UI_THEME.alpha.idle : UI_THEME.alpha.active);

    this.on("pointerover", () => {
      if (this._disabled) return;
      this.bg.setFillStyle(this.colors.hover);
      this.setAlpha(UI_THEME.alpha.hover);
    });
    this.on("pointerout", () => {
      if (this._disabled) return;
      this.bg.setFillStyle(this.colors.base);
      this.setAlpha(this._idle ? UI_THEME.alpha.idle : UI_THEME.alpha.active);
    });
    this.on("pointerup", () => {
      if (this._disabled) return;
      cfg.onClick();
    });

    cfg.scene.add.existing(this);
  }

  setDisabled(on: boolean): this {
    this._disabled = on;
    this.setAlpha(
      on && this.dimWhenDisabled
        ? UI_THEME.alpha.disabled
        : this._idle ? UI_THEME.alpha.idle : UI_THEME.alpha.active,
    );
    if (this.input) this.input.cursor = on ? 'default' : 'pointer';
    return this;
  }

  /** Switch the button into "idle/waiting" alpha (e.g. before turn starts). */
  setIdle(on: boolean): this {
    this._idle = on;
    if (!this._disabled) this.setAlpha(on ? UI_THEME.alpha.idle : UI_THEME.alpha.active);
    return this;
  }

  setLabel(text: string): this {
    this.txt.setText(text);
    return this;
  }

  /** Switch button visual style at runtime. Updates bg color; hover/out handlers follow. */
  setStyle(style: BtnStyle): this {
    this.colors = UI_THEME.component.button[style];
    this.bg.setFillStyle(this.colors.base);
    return this;
  }
}
