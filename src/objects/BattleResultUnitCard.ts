import Phaser from 'phaser';
import type { BattleResultUnit } from '../core/phases';
import { Panel } from '../ui/Panel';
import { scaled } from '../ui/layout';
import { UI_THEME } from '../ui/theme';

export interface BattleResultUnitCardConfig {
  scene:  Phaser.Scene;
  x:      number;  // center X of the card
  y:      number;  // center Y of the card
  width:  number;
  height: number;
  unit:   BattleResultUnit;
}

export class BattleResultUnitCard extends Phaser.GameObjects.Container {
  constructor(cfg: BattleResultUnitCardConfig) {
    super(cfg.scene, cfg.x, cfg.y);

    const { scene, width: cw, height: ch, unit } = cfg;
    const alpha  = unit.isAlive ? 1 : 0.45;
    const sprSz  = scaled(72);
    const sprY   = -scaled(30);
    const colors = UI_THEME.component.resultCard;

    this.add(new Panel({
      scene,
      x:         0,
      y:         0,
      width:     cw,
      height:    ch,
      fill:      colors.bg,
      fillAlpha: alpha,
      stroke:    colors.border,
    }));

    if (unit.spriteKey && scene.textures.exists(unit.spriteKey)) {
      this.add(
        scene.add.image(0, sprY, unit.spriteKey)
          .setDisplaySize(sprSz, sprSz)
          .setAlpha(alpha),
      );
    } else {
      this.add(
        scene.add.rectangle(0, sprY, sprSz, sprSz, colors.fallback)
          .setAlpha(alpha),
      );
    }

    // Unit name — fades with dead alpha
    this.add(
      scene.add.text(0, scaled(52), unit.name, {
        fontSize: `${scaled(13)}px`,
        color:    UI_THEME.color.value.neutral,
      }).setOrigin(0.5).setAlpha(alpha),
    );

    // Level — always full alpha (same as original)
    this.add(
      scene.add.text(0, scaled(70), `Lv ${unit.newLevel}`, {
        fontSize:  `${scaled(14)}px`,
        color:     UI_THEME.color.value.highlight,
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );

    // Level-up label — always full alpha (same as original)
    this.add(
      scene.add.text(0, scaled(88), '+1 lvl', {
        fontSize: `${scaled(12)}px`,
        color:    UI_THEME.color.value.positive,
      }).setOrigin(0.5),
    );

    scene.add.existing(this);
  }
}
