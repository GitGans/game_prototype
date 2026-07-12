import Phaser from 'phaser';
import { UI_THEME, fontSize } from './theme';
import { Button } from './Button';
import { Panel } from './Panel';
import { scaled } from './layout';

/**
 * Generic modal primitive: shows a message with confirm/cancel controls.
 * It owns no business meaning — callers decide what confirm/cancel means.
 */
export interface ConfirmationDialogConfig {
  scene: Phaser.Scene;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  width?: number;
}

// Raw (unscaled) design pixels — scaled via scaled() at point of use, same
// convention as ContextMenu.ts's PAD/BTN_W/BTN_H.
const DEFAULT_WIDTH = 360;
const PAD = 20;
const BUTTON_W = 120;
const BUTTON_H = 40;
const BUTTON_GAP = 20;
const BUTTON_ROW_H = 76; // button height + top/bottom breathing room

export class ConfirmationDialog {
  private readonly onConfirm: () => void;
  private readonly onCancel?: () => void;

  private overlay: Phaser.GameObjects.Rectangle;
  private panel: Panel;
  private text: Phaser.GameObjects.Text;
  private cancelButton: Button;
  private confirmButton: Button;

  /** Guards against double teardown and double callback invocation. */
  private done = false;

  constructor(cfg: ConfirmationDialogConfig) {
    this.onConfirm = cfg.onConfirm;
    this.onCancel = cfg.onCancel;

    const scene = cfg.scene;
    const sw = scene.scale.width;
    const sh = scene.scale.height;

    // Caller-provided `width` is final screen pixels (same contract as
    // Button's w/h — see Button.ts, no internal scaling of caller-supplied
    // sizes). Our own default and internal layout constants are raw design
    // pixels, scaled here exactly like ContextMenu does for its own tokens.
    const pad = scaled(PAD);
    const buttonW = scaled(BUTTON_W);
    const buttonH = scaled(BUTTON_H);
    const buttonGap = scaled(BUTTON_GAP);
    const buttonRowH = scaled(BUTTON_ROW_H);
    const width = cfg.width ?? scaled(DEFAULT_WIDTH);
    const wrapWidth = width - pad * 2;
    const depth = UI_THEME.depth.modal;

    this.overlay = scene.add.rectangle(
      sw / 2, sh / 2, sw, sh,
      UI_THEME.component.overlay.dim, UI_THEME.component.overlay.dimAlpha,
    ).setDepth(depth).setInteractive();
    this.overlay.on('pointerup', () => this.resolve(false));

    this.text = scene.add.text(0, 0, cfg.message, {
      fontSize: fontSize('md'),
      color: UI_THEME.color.value.white,
      align: 'center',
      wordWrap: { width: wrapWidth },
    }).setOrigin(0.5).setDepth(depth + 2);

    const height = pad * 2 + this.text.height + buttonRowH;

    this.panel = new Panel({ scene, x: sw / 2, y: sh / 2, width, height, depth: depth + 1 });
    scene.add.existing(this.panel); // Panel does not self-register — see Panel.ts:20-26
    // Dedicated hit area so clicks inside the panel don't fall through to the overlay.
    this.panel.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains,
    );

    this.text.setPosition(sw / 2, sh / 2 - buttonRowH / 2);

    const rowY = sh / 2 + height / 2 - pad - buttonH / 2;
    this.cancelButton = new Button({
      scene, x: sw / 2 - (buttonW + buttonGap) / 2, y: rowY,
      w: buttonW, h: buttonH,
      label: cfg.cancelLabel ?? 'Cancel',
      style: 'neutral',
      onClick: () => this.resolve(false),
    }).setDepth(depth + 2);

    this.confirmButton = new Button({
      scene, x: sw / 2 + (buttonW + buttonGap) / 2, y: rowY,
      w: buttonW, h: buttonH,
      label: cfg.confirmLabel ?? 'Confirm',
      style: 'primary',
      onClick: () => this.resolve(true),
    }).setDepth(depth + 2);
  }

  /** Safe to call multiple times; only the first call has any effect. */
  destroy(): void {
    if (this.done) return;
    this.done = true;
    this.teardown();
  }

  private resolve(confirmed: boolean): void {
    if (this.done) return;
    this.done = true;
    this.teardown();
    if (confirmed) this.onConfirm();
    else this.onCancel?.();
  }

  private teardown(): void {
    this.overlay.destroy();
    this.panel.destroy();
    this.text.destroy();
    this.cancelButton.destroy();
    this.confirmButton.destroy();
  }
}
