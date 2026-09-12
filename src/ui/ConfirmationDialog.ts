import Phaser from 'phaser';
import { UI_THEME, fontSize } from './theme';
import { Button } from './Button';
import { ModalFrame } from './ModalFrame';
import { scaled } from './layout';

/**
 * Generic modal primitive: shows a message with confirm/cancel controls.
 * It owns no business meaning — callers decide what confirm/cancel means.
 *
 * Framing (scrim, panel, hit area, one-shot teardown-before-callback) lives in `ModalFrame`,
 * shared with `ActionDialog`. Behaviour here is unchanged by that extraction.
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
  private readonly frame: ModalFrame;

  constructor(cfg: ConfirmationDialogConfig) {
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

    // Measured from the laid-out Text before the panel is sized.
    const text = scene.add.text(0, 0, cfg.message, {
      fontSize: fontSize('md'),
      color: UI_THEME.color.value.white,
      align: 'center',
      wordWrap: { width: wrapWidth },
    }).setOrigin(0.5);

    const height = pad * 2 + text.height + buttonRowH;

    this.frame = new ModalFrame({
      scene, width, height,
      onDismiss: () => cfg.onCancel?.(),
    });

    text.setPosition(sw / 2, sh / 2 - buttonRowH / 2).setDepth(this.frame.contentDepth);

    const rowY = sh / 2 + height / 2 - pad - buttonH / 2;
    const cancelButton = new Button({
      scene, x: sw / 2 - (buttonW + buttonGap) / 2, y: rowY,
      w: buttonW, h: buttonH,
      label: cfg.cancelLabel ?? 'Cancel',
      style: 'neutral',
      onClick: () => this.frame.resolve(() => cfg.onCancel?.()),
    }).setDepth(this.frame.contentDepth);

    const confirmButton = new Button({
      scene, x: sw / 2 + (buttonW + buttonGap) / 2, y: rowY,
      w: buttonW, h: buttonH,
      label: cfg.confirmLabel ?? 'Confirm',
      style: 'primary',
      onClick: () => this.frame.resolve(cfg.onConfirm),
    }).setDepth(this.frame.contentDepth);

    this.frame.add(text, cancelButton, confirmButton);
  }

  /** Safe to call multiple times; only the first call has any effect. */
  destroy(): void {
    this.frame.destroy();
  }
}
