import Phaser from 'phaser';
import { UI_THEME, BtnStyle } from './theme';
import { Panel } from './Panel';
import { Button } from './Button';
import { rowItemCenterX } from './layout';

/**
 * The shared framing every modal in this codebase needs: a full-screen input-blocking scrim, a
 * centred panel with its own hit area, the standard dismissal controls, a content band that cannot
 * overlap them, one-shot teardown, and teardown-BEFORE-callback resolution.
 *
 * It owns no business meaning — what "dismiss" or an action MEANS is the caller's. Every dimension
 * comes from `UI_THEME.component.modal`; this file declares no sizes of its own.
 *
 * Load-bearing behaviours (not defensive style):
 *   - the scrim is ALWAYS interactive, even when backdrop dismissal is off, so a click outside an
 *     undismissable modal is swallowed instead of reaching the screen underneath;
 *   - the panel carries a dedicated hit area, so a click inside it never counts as a backdrop click;
 *   - every exit — backdrop, close icon, footer button, action button, Escape — runs through the
 *     same one-shot `done` guard, so overlapping input can never fire two callbacks;
 *   - teardown happens FIRST and only then the callback, so a reconciler that destroys a modal in
 *     response to committed state can never fire an action while doing so;
 *   - while a modal with `dismiss.escape` is open the frame OWNS the Escape key: it listens on the
 *     plugin's ESC `Key` (which Phaser runs before its own `keydown-ESC`/`keydown` emits) and stops
 *     the event's propagation, so no scene-level handler — in this scene or any other active one —
 *     also reacts to the keypress that closed the modal.
 */

/** Which control the user used to leave the modal without completing its action. */
export type ModalDismissReason = 'backdrop' | 'close_icon' | 'button' | 'escape';

export interface ModalDismissButtonConfig {
  label: string;
  /** Defaults to 'neutral'. */
  style?: BtnStyle;
}

/**
 * Every route is stated explicitly — no defaults — so a dialog's ways out are readable at its
 * construction site.
 */
export interface ModalDismissOptions {
  /** Click on the scrim dismisses. The scrim blocks input either way. */
  backdrop: boolean;
  /** Show the `✕` icon in the panel's top-right corner. */
  closeIcon: boolean;
  /** Footer dismissal button, or `false` for none. Rendered first in the footer row. */
  button: false | ModalDismissButtonConfig;
  /**
   * `Escape` dismisses. While such a modal is open the frame OWNS the Escape key: it consumes the
   * event before any scene-level handler in this or any other active scene, and drops its listener
   * on every teardown path. `false` leaves keyboard dismissal off entirely — the key is not touched
   * and not consumed.
   */
  escape: boolean;
}

/** A non-dismissal footer button — the modal's successful outcome(s). */
export interface ModalAction {
  label: string;
  style: BtnStyle;
  /** Invoked after the frame has torn itself down. */
  onSelect: () => void;
}

export interface ModalFrameConfig {
  scene: Phaser.Scene;
  /** Final screen pixels — panel width, same contract as Button's w/h. The caller scales. */
  width: number;
  /**
   * Final screen pixels the caller's own content needs. The frame adds padding plus header/footer
   * reserves on top, so caller content can never overlap the close icon or the button row.
   */
  contentHeight: number;
  dismiss: ModalDismissOptions;
  /** Called after teardown for any enabled dismissal route. Never invoked by `destroy()`. */
  onDismiss: (reason: ModalDismissReason) => void;
  /** Optional non-dismissal buttons, rendered after the dismissal button in the same row. */
  actions?: ModalAction[];
}

const CLOSE_ICON_LABEL = '✕';

/**
 * The usable content width inside a panel of `panelWidth`. Exported because a caller must wrap and
 * measure its own content BEFORE it can tell the frame how tall that content is.
 */
export function modalContentWidth(panelWidth: number): number {
  return panelWidth - UI_THEME.component.modal.pad * 2;
}

export class ModalFrame {
  /** Depth for caller-owned content: above both the scrim and the panel. */
  readonly contentDepth: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  /** Centre of the band reserved for caller content — clear of the icon and the button row. */
  readonly contentCenterX: number;
  readonly contentCenterY: number;
  readonly contentWidth: number;
  readonly contentHeight: number;

  private readonly onDismiss: (reason: ModalDismissReason) => void;
  private readonly overlay: Phaser.GameObjects.Rectangle;
  private readonly panel: Panel;
  /** Frame-owned controls (close icon, footer buttons). */
  private readonly chrome: Phaser.GameObjects.GameObject[] = [];
  /** Caller-owned objects registered via `add()`. */
  private readonly content: Phaser.GameObjects.GameObject[] = [];
  /**
   * The scene-plugin-owned ESC key, present only when `dismiss.escape` is on. The plugin DEDUPES
   * keys by keycode (`addKey` returns any existing instance), so this key may be shared: the frame
   * removes its own listener on teardown and never removes or destroys the key itself.
   */
  private readonly escapeKey?: Phaser.Input.Keyboard.Key;

  /** Guards against double teardown and double callback invocation. */
  private done = false;

  constructor(cfg: ModalFrameConfig) {
    this.onDismiss = cfg.onDismiss;

    const scene = cfg.scene;
    const sw = scene.scale.width;
    const sh = scene.scale.height;
    const depth = UI_THEME.depth.modal;
    const token = UI_THEME.component.modal;

    const actions = cfg.actions ?? [];
    const dismissButton = cfg.dismiss.button;
    const footerCount = (dismissButton ? 1 : 0) + actions.length;

    // Reserved bands. Nothing is reserved for a control that is not rendered, so a plain modal is
    // exactly as tall as its content plus padding.
    const headerReserve = cfg.dismiss.closeIcon ? token.closeIconSize + token.closeIconGap : 0;
    const footerReserve = footerCount > 0 ? token.buttonH + token.footerGap : 0;

    this.width = cfg.width;
    this.height = token.pad * 2 + headerReserve + cfg.contentHeight + footerReserve;
    this.centerX = sw / 2;
    this.centerY = sh / 2;
    this.contentDepth = depth + 2;

    this.contentWidth = modalContentWidth(cfg.width);
    this.contentHeight = cfg.contentHeight;
    this.contentCenterX = this.centerX;
    this.contentCenterY =
      this.centerY - this.height / 2 + token.pad + headerReserve + cfg.contentHeight / 2;

    // Always interactive: with backdrop dismissal off the click is swallowed, not forwarded.
    this.overlay = scene.add.rectangle(
      sw / 2, sh / 2, sw, sh,
      UI_THEME.component.overlay.dim, UI_THEME.component.overlay.dimAlpha,
    ).setDepth(depth).setInteractive();
    if (cfg.dismiss.backdrop) {
      this.overlay.on('pointerup', () => this.dismiss('backdrop'));
    }

    this.panel = new Panel({
      scene, x: this.centerX, y: this.centerY,
      width: this.width, height: this.height, depth: depth + 1,
    });
    scene.add.existing(this.panel); // Panel does not self-register — see Panel.ts
    // Dedicated hit area so clicks inside the panel don't fall through to the overlay.
    this.panel.setInteractive(
      new Phaser.Geom.Rectangle(-this.width / 2, -this.height / 2, this.width, this.height),
      Phaser.Geom.Rectangle.Contains,
    );

    if (cfg.dismiss.closeIcon) {
      this.chrome.push(new Button({
        scene,
        x: this.centerX + this.width / 2 - token.pad - token.closeIconSize / 2,
        y: this.centerY - this.height / 2 + token.pad + token.closeIconSize / 2,
        w: token.closeIconSize, h: token.closeIconSize,
        label: CLOSE_ICON_LABEL,
        style: 'danger',
        onClick: () => this.dismiss('close_icon'),
      }).setDepth(this.contentDepth));
    }

    if (footerCount > 0) {
      const rowY = this.centerY + this.height / 2 - token.pad - token.buttonH / 2;
      let index = 0;

      if (dismissButton) {
        this.chrome.push(new Button({
          scene,
          x: rowItemCenterX(this.centerX, token.buttonW, token.buttonGap, footerCount, index++),
          y: rowY, w: token.buttonW, h: token.buttonH,
          label: dismissButton.label,
          style: dismissButton.style ?? 'neutral',
          onClick: () => this.dismiss('button'),
        }).setDepth(this.contentDepth));
      }

      for (const action of actions) {
        this.chrome.push(new Button({
          scene,
          x: rowItemCenterX(this.centerX, token.buttonW, token.buttonGap, footerCount, index++),
          y: rowY, w: token.buttonW, h: token.buttonH,
          label: action.label,
          style: action.style,
          onClick: () => this.resolve(action.onSelect),
        }).setDepth(this.contentDepth));
      }
    }

    const keyboard = scene.input.keyboard;
    if (cfg.dismiss.escape && keyboard) {
      // `enableCapture: false`: the frame must not leave a permanent browser-level preventDefault
      // on ESC behind. Capture is registered on the SCENE's plugin and outlives this transient
      // modal, and swallowing ESC at the browser level would also break the browser's own
      // fullscreen exit. Capture only controls preventDefault — the key still fires.
      this.escapeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC, false);
      this.escapeKey.on('down', this.onEscape);
    }
  }

  /**
   * Phaser's `Key` DOWN event passes `(key, event)` — the native event is the SECOND argument.
   * `stopPropagation()` (not `stopImmediatePropagation()`) is what blocks the key for good: Phaser
   * rewrites both methods as flag setters, and its update loop RESETS the
   * `stopImmediatePropagation` flag after each event so later Scenes still see it, while the
   * `stopPropagation` flag is never reset and makes every later keyboard plugin skip the event
   * entirely. The event is consumed BEFORE the modal resolves, because `resolve()` can
   * synchronously start a phase transition.
   */
  private readonly onEscape = (
    _key: Phaser.Input.Keyboard.Key,
    event: KeyboardEvent,
  ): void => {
    event.stopPropagation();
    this.dismiss('escape');
  };

  /** Registers caller-owned objects for teardown. They are destroyed with the frame. */
  add(...objects: Phaser.GameObjects.GameObject[]): void {
    this.content.push(...objects);
  }

  /** Safe to call multiple times; only the first call has any effect. Invokes no callback. */
  destroy(): void {
    if (this.done) return;
    this.done = true;
    this.teardown();
  }

  /** Tears down first, THEN runs the action. One-shot. */
  resolve(run: () => void): void {
    if (this.done) return;
    this.done = true;
    this.teardown();
    run();
  }

  /** The single exit for every enabled dismissal control. */
  private dismiss(reason: ModalDismissReason): void {
    this.resolve(() => this.onDismiss(reason));
  }

  private teardown(): void {
    // The key itself is plugin-owned and possibly shared — drop only our listener.
    this.escapeKey?.off('down', this.onEscape);
    this.overlay.destroy();
    this.panel.destroy();
    for (const object of this.chrome) object.destroy();
    for (const object of this.content) object.destroy();
  }
}
