import Phaser from 'phaser';
import { UI_THEME, fontSize } from './theme';
import { Button } from './Button';
import { ModalFrame } from './ModalFrame';
import { scaled } from './layout';

/**
 * Generic modal primitive: a titled list of actions, each enabled or disabled with a stated
 * reason. It owns no business meaning — the caller decides what the actions are, whether they
 * are available and what selecting one does.
 *
 * A disabled action stays VISIBLE with its explanation, because "you cannot do this, and here
 * is why" is information; silently dropping the row would leave the player guessing.
 */
export interface ActionDialogAction {
  id: string;
  label: string;
  enabled: boolean;
  /** Shown under a disabled action. Ignored when enabled. */
  disabledExplanation?: string | null;
  onSelect: () => void;
}

export interface ActionDialogConfig {
  scene: Phaser.Scene;
  title: string;
  body?: string | null;
  /** Rendered top to bottom in this order. */
  actions: readonly ActionDialogAction[];
  /** Outside click or the close control. */
  onDismiss: () => void;
  width?: number;
}

// Raw (unscaled) design pixels, scaled at point of use — the ConfirmationDialog convention.
const DEFAULT_WIDTH = 360;
const PAD = 20;
const ROW_GAP = 10;
const BUTTON_W = 220;
const BUTTON_H = 40;
const EXPLANATION_GAP = 4;
const CLOSE_H = 36;
const CLOSE_W = 120;

export class ActionDialog {
  private readonly frame: ModalFrame;

  constructor(cfg: ActionDialogConfig) {
    const scene = cfg.scene;
    const pad = scaled(PAD);
    const rowGap = scaled(ROW_GAP);
    const buttonW = scaled(BUTTON_W);
    const buttonH = scaled(BUTTON_H);
    const explanationGap = scaled(EXPLANATION_GAP);
    const closeH = scaled(CLOSE_H);
    const closeW = scaled(CLOSE_W);
    const width = cfg.width ?? scaled(DEFAULT_WIDTH);
    const wrapWidth = width - pad * 2;

    // Measure every text block before sizing the panel — same order as ConfirmationDialog.
    const title = scene.add.text(0, 0, cfg.title, {
      fontSize: fontSize('lg'),
      color: UI_THEME.color.value.white,
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: wrapWidth },
    }).setOrigin(0.5);

    const body = cfg.body
      ? scene.add.text(0, 0, cfg.body, {
          fontSize: fontSize('sm'),
          color: UI_THEME.color.value.white,
          align: 'center',
          wordWrap: { width: wrapWidth },
        }).setOrigin(0.5)
      : null;

    const explanations = cfg.actions.map(action =>
      !action.enabled && action.disabledExplanation
        ? scene.add.text(0, 0, action.disabledExplanation, {
            fontSize: fontSize('sm'),
            color: UI_THEME.color.value.white,
            align: 'center',
            wordWrap: { width: wrapWidth },
          }).setOrigin(0.5).setAlpha(UI_THEME.alpha.disabled)
        : null,
    );

    const actionsHeight = cfg.actions.reduce((total, _action, i) => {
      const explanation = explanations[i];
      return total + buttonH + (explanation ? explanationGap + explanation.height : 0) + rowGap;
    }, 0);

    const height =
      pad * 2 +
      title.height + rowGap +
      (body ? body.height + rowGap : 0) +
      actionsHeight +
      closeH;

    this.frame = new ModalFrame({ scene, width, height, onDismiss: cfg.onDismiss });

    const left = this.frame.centerX;
    let y = this.frame.centerY - height / 2 + pad;

    title.setPosition(left, y + title.height / 2).setDepth(this.frame.contentDepth);
    y += title.height + rowGap;
    this.frame.add(title);

    if (body) {
      body.setPosition(left, y + body.height / 2).setDepth(this.frame.contentDepth);
      y += body.height + rowGap;
      this.frame.add(body);
    }

    cfg.actions.forEach((action, i) => {
      const button = new Button({
        scene, x: left, y: y + buttonH / 2,
        w: buttonW, h: buttonH,
        label: action.label,
        style: action.enabled ? 'primary' : 'neutral',
        // Resolution tears the widget down before running the callback, so a selection can
        // never be delivered by a dialog that is still on screen.
        onClick: () => this.frame.resolve(action.onSelect),
      }).setDepth(this.frame.contentDepth);
      // A disabled Button blocks its own click; the dialog adds no second guard, so there is
      // exactly one place that decides whether a callback can fire.
      button.setDisabled(!action.enabled);
      this.frame.add(button);
      y += buttonH;

      const explanation = explanations[i];
      if (explanation) {
        explanation
          .setPosition(left, y + explanationGap + explanation.height / 2)
          .setDepth(this.frame.contentDepth);
        this.frame.add(explanation);
        y += explanationGap + explanation.height;
      }
      y += rowGap;
    });

    const close = new Button({
      scene, x: left, y: y + closeH / 2 - rowGap,
      w: closeW, h: closeH,
      label: 'Close',
      style: 'neutral',
      onClick: () => this.frame.resolve(cfg.onDismiss),
    }).setDepth(this.frame.contentDepth);
    this.frame.add(close);
  }

  /** Safe to call multiple times; only the first call has any effect. Invokes no callback. */
  destroy(): void {
    this.frame.destroy();
  }
}
