import Phaser from 'phaser';
import { scaled } from './layout';
import { UI_THEME } from './theme';

export interface PanelConfig {
  scene:        Phaser.Scene;
  /** Center X of the panel in the parent coordinate space. */
  x:            number;
  /** Center Y of the panel in the parent coordinate space. */
  y:            number;
  width:        number;
  height:       number;
  fill?:        number;  // default: UI_THEME.component.panel.bg
  fillAlpha?:   number;  // default: 1
  stroke?:      number;  // border color hex; omit = no border
  strokeWidth?: number;  // raw px before scaling; default: 1
  depth?:       number;
}

/**
 * Game-agnostic visual container: background rectangle with optional border.
 *
 * Registration: Panel does NOT call scene.add.existing(this).
 * - Standalone use: scene.add.existing(new Panel({ ... }))
 * - As child:       parentContainer.add(new Panel({ ... }))
 */
export class Panel extends Phaser.GameObjects.Container {
  constructor(cfg: PanelConfig) {
    super(cfg.scene, cfg.x, cfg.y);

    // Rectangle at (0,0) is center-origin by default in Phaser — matches x/y semantics.
    const bg = cfg.scene.add.rectangle(
      0, 0,
      cfg.width,
      cfg.height,
      cfg.fill ?? UI_THEME.component.panel.bg,
    ).setAlpha(cfg.fillAlpha ?? 1);

    if (cfg.stroke !== undefined) {
      bg.setStrokeStyle(
        cfg.strokeWidth !== undefined ? scaled(cfg.strokeWidth) : scaled(1),
        cfg.stroke,
      );
    }

    this.add(bg);
    this.setSize(cfg.width, cfg.height);
    if (cfg.depth !== undefined) this.setDepth(cfg.depth);
  }
}
