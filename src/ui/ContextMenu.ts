import Phaser from 'phaser';
import { UI_THEME } from './theme';
import { Button } from './Button';
import { LAYOUT_SCALE } from '../core/Constants';

export interface ContextMenuConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
  options: Array<{ label: string; onClick: () => void }>;
  onDismiss?: () => void;
}

export class ContextMenu extends Phaser.GameObjects.Container {
  constructor(cfg: ContextMenuConfig) {
    super(cfg.scene, cfg.x, cfg.y);

    const PAD    = Math.round(8  * LAYOUT_SCALE);
    const BTN_W  = Math.round(120 * LAYOUT_SCALE);
    const BTN_H  = Math.round(32  * LAYOUT_SCALE);
    const panelW = BTN_W + PAD * 2;
    const panelH = cfg.options.length * (BTN_H + PAD) + PAD;

    const sw = cfg.scene.scale.width;
    const sh = cfg.scene.scale.height;

    // Invisible click-catcher; color is irrelevant because alpha is 0.
    const overlay = cfg.scene.add.rectangle(
      sw / 2 - cfg.x,
      sh / 2 - cfg.y,
      sw, sh,
      0x000000, 0,
    ).setInteractive();
    overlay.on('pointerup', () => cfg.onDismiss?.());
    this.add(overlay);

    const bg = cfg.scene.add.rectangle(
      panelW / 2,
      panelH / 2,
      panelW,
      panelH,
      UI_THEME.component.contextMenu.bg,
    );
    bg.setStrokeStyle(1, UI_THEME.component.contextMenu.border);
    this.add(bg);

    cfg.options.forEach((opt, i) => {
      const btn = new Button({
        scene: cfg.scene,
        x: PAD + BTN_W / 2,
        y: PAD + BTN_H / 2 + i * (BTN_H + PAD),
        w: BTN_W,
        h: BTN_H,
        label: opt.label,
        style: 'neutral',
        onClick: opt.onClick,
      });
      this.add(btn);
    });

    this.setDepth(UI_THEME.depth.contextMenu);
  }

  dismiss(): void {
    this.destroy(true);
  }
}
