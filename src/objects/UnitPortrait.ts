import Phaser from 'phaser';
import { scaled } from '../ui/layout';
import { UI_THEME } from '../ui/theme';
import { BATTLE_VISUAL_THEME } from './battleVisualTheme';

export interface UnitPortraitConfig {
  scene:      Phaser.Scene;
  x:          number;
  y:          number;
  size:       number;
  spriteKey:  string | null;
  /** Used as letter fallback and optional name label. */
  name?:      string;
  /** Render name text below the portrait. Default: false. */
  showLabel?: boolean;
  /** Dim tint + hover-to-brighten for unselected state. Default: false. */
  dimmed?:    boolean;
  /** If provided, portrait becomes interactive and fires this callback. */
  onClick?:   () => void;
}

export class UnitPortrait extends Phaser.GameObjects.Container {
  constructor(cfg: UnitPortraitConfig) {
    super(cfg.scene, cfg.x, cfg.y);

    const { scene, size, spriteKey, name = '', showLabel, dimmed = false, onClick } = cfg;
    const navyBase  = UI_THEME.component.button.navy.base;
    const navyHover = UI_THEME.component.button.navy.hover;
    const tint      = dimmed ? BATTLE_VISUAL_THEME.unitPortrait.dimmedTint : BATTLE_VISUAL_THEME.unitPortrait.normalTint;

    if (spriteKey && scene.textures.exists(spriteKey)) {
      const img = scene.add.image(size / 2, size / 2, spriteKey)
        .setDisplaySize(size, size)
        .setTint(tint);

      if (onClick) {
        img.setInteractive({ useHandCursor: true });
        if (dimmed) {
          img.on('pointerover', () => img.setTint(BATTLE_VISUAL_THEME.unitPortrait.normalTint));
          img.on('pointerout',  () => img.setTint(tint));
        }
        img.on('pointerup', onClick);
      }
      this.add(img);
    } else {
      const rect = scene.add.rectangle(size / 2, size / 2, size, size,
        dimmed ? navyBase : navyHover,
      );
      if (onClick) {
        rect.setInteractive({ useHandCursor: true });
        if (dimmed) {
          rect.on('pointerover', () => rect.setFillStyle(navyHover));
          rect.on('pointerout',  () => rect.setFillStyle(navyBase));
        }
        rect.on('pointerup', onClick);
      }
      this.add(rect);

      if (name) {
        this.add(
          scene.add.text(size / 2, size / 2, name.charAt(0), {
            fontSize:  `${scaled(14)}px`,
            color:     UI_THEME.color.value.neutral,
            fontStyle: 'bold',
          }).setOrigin(0.5),
        );
      }
    }

    if (showLabel && name) {
      this.add(
        scene.add.text(size / 2, size + scaled(4), name, {
          fontSize: `${scaled(12)}px`,
          color:    UI_THEME.color.value.neutral,
        }).setOrigin(0.5, 0),
      );
    }
    // Caller calls scene.add.existing(this) or container.add(this)
  }
}
