import Phaser from 'phaser';
import { UI_THEME, fontSize } from '../ui/theme';
import { PREP_VISUAL_THEME, PrepActionTileStyle } from './prepVisualTheme';

export interface PrepActionTileConfig {
  scene:    Phaser.Scene;
  x:        number;
  y:        number;
  size:     number;
  label:    string;
  styleKey: PrepActionTileStyle;
  onClick:  () => void;
}

export class PrepActionTile extends Phaser.GameObjects.Container {
  constructor(cfg: PrepActionTileConfig) {
    super(cfg.scene, cfg.x, cfg.y);

    const bg = cfg.scene.add.rectangle(
      0, 0, cfg.size, cfg.size,
      PREP_VISUAL_THEME.actionTile[cfg.styleKey],
    ).setInteractive({ useHandCursor: true });

    const label = cfg.scene.add.text(0, 0, cfg.label, {
      fontSize: fontSize('md'),
      color:    UI_THEME.color.value.white,
    }).setOrigin(0.5);

    this.add([bg, label]);
    this.setSize(cfg.size, cfg.size);

    bg.on('pointerover', () => bg.setAlpha(UI_THEME.alpha.hover));
    bg.on('pointerout',  () => bg.setAlpha(UI_THEME.alpha.active));
    bg.on('pointerup',   cfg.onClick);

    cfg.scene.add.existing(this);
  }
}
