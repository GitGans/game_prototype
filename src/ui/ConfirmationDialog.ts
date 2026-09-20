import Phaser from 'phaser';
import { UI_THEME, fontSize } from './theme';
import { ModalFrame, ModalDismissOptions, modalContentWidth } from './ModalFrame';

/**
 * Generic modal primitive: a message plus one confirm action.
 * It owns no business meaning — callers decide what confirm and cancel mean.
 *
 * Everything structural — scrim, panel, hit area, close icon, footer row, one-shot
 * teardown-before-callback — lives in `ModalFrame`. This file owns only the message.
 */
export interface ConfirmationDialogConfig {
  scene: Phaser.Scene;
  message: string;
  /** Which ways out this dialog offers. Every route ends in `onCancel`. */
  dismiss: ModalDismissOptions;
  onConfirm: () => void;
  /** Required: every enabled dismissal route must have a defined outcome. */
  onCancel: () => void;
  confirmLabel?: string;
  /** Final screen pixels — panel width. Defaults to `UI_THEME.component.modal.defaultWidth`. */
  width?: number;
}

export class ConfirmationDialog {
  private readonly frame: ModalFrame;

  constructor(cfg: ConfirmationDialogConfig) {
    const scene = cfg.scene;

    // Caller-provided `width` is final screen pixels (same contract as Button's w/h); the default
    // is the pre-scaled theme token.
    const width = cfg.width ?? UI_THEME.component.modal.defaultWidth;

    // Measured from the laid-out Text before the frame is sized: the frame needs the content
    // height, and the wrap width is derived from the panel width by the frame's own helper.
    const text = scene.add.text(0, 0, cfg.message, {
      fontSize: fontSize('md'),
      color: UI_THEME.color.value.white,
      align: 'center',
      wordWrap: { width: modalContentWidth(width) },
    }).setOrigin(0.5);

    this.frame = new ModalFrame({
      scene,
      width,
      contentHeight: text.height,
      dismiss: cfg.dismiss,
      // This dialog treats every route the same, so the reason is deliberately ignored.
      onDismiss: () => cfg.onCancel(),
      actions: [{
        label: cfg.confirmLabel ?? 'Confirm',
        style: 'primary',
        onSelect: cfg.onConfirm,
      }],
    });

    text
      .setPosition(this.frame.contentCenterX, this.frame.contentCenterY)
      .setDepth(this.frame.contentDepth);

    this.frame.add(text);
  }

  /** Safe to call multiple times; only the first call has any effect. Invokes no callback. */
  destroy(): void {
    this.frame.destroy();
  }
}
