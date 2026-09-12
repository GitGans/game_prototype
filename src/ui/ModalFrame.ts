import Phaser from 'phaser';
import { UI_THEME } from './theme';
import { Panel } from './Panel';

/**
 * The shared framing every modal in this codebase needs: a full-screen input-blocking scrim, a
 * centred panel with its own hit area, a content depth above both, one-shot teardown, and
 * teardown-BEFORE-callback resolution.
 *
 * Extracted from `ConfirmationDialog`, which was the only place this stack existed. It owns no
 * business meaning and no layout beyond the panel itself — what goes inside is the caller's.
 *
 * Two behaviours here are load-bearing rather than defensive style:
 *   - the panel carries a dedicated hit area, so a click inside it does not fall through to the
 *     scrim and dismiss the modal;
 *   - `resolve()` tears down FIRST and only then invokes the callback, so a reconciler that
 *     destroys a modal in response to committed state can never fire an action while doing so.
 */
export interface ModalFrameConfig {
  scene: Phaser.Scene;
  /** Final screen pixels — the same contract as Button's w/h. The caller scales. */
  width: number;
  /** Final screen pixels. The caller measures its own content before constructing the frame. */
  height: number;
  /** Outside click. Never invoked by `destroy()`. */
  onDismiss: () => void;
}

export class ModalFrame {
  /** Depth for caller-owned content: above both the scrim and the panel. */
  readonly contentDepth: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;

  private readonly onDismiss: () => void;
  private readonly overlay: Phaser.GameObjects.Rectangle;
  private readonly panel: Panel;
  private readonly content: Phaser.GameObjects.GameObject[] = [];

  /** Guards against double teardown and double callback invocation. */
  private done = false;

  constructor(cfg: ModalFrameConfig) {
    this.onDismiss = cfg.onDismiss;

    const scene = cfg.scene;
    const sw = scene.scale.width;
    const sh = scene.scale.height;
    const depth = UI_THEME.depth.modal;

    this.width = cfg.width;
    this.height = cfg.height;
    this.centerX = sw / 2;
    this.centerY = sh / 2;
    this.contentDepth = depth + 2;

    this.overlay = scene.add.rectangle(
      sw / 2, sh / 2, sw, sh,
      UI_THEME.component.overlay.dim, UI_THEME.component.overlay.dimAlpha,
    ).setDepth(depth).setInteractive();
    this.overlay.on('pointerup', () => this.resolve(this.onDismiss));

    this.panel = new Panel({
      scene, x: this.centerX, y: this.centerY,
      width: cfg.width, height: cfg.height, depth: depth + 1,
    });
    scene.add.existing(this.panel); // Panel does not self-register — see Panel.ts
    // Dedicated hit area so clicks inside the panel don't fall through to the overlay.
    this.panel.setInteractive(
      new Phaser.Geom.Rectangle(-cfg.width / 2, -cfg.height / 2, cfg.width, cfg.height),
      Phaser.Geom.Rectangle.Contains,
    );
  }

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

  private teardown(): void {
    this.overlay.destroy();
    this.panel.destroy();
    for (const object of this.content) object.destroy();
  }
}
