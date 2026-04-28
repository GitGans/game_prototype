import Phaser from 'phaser';
import type { BattleResultUnit } from '../../core/phases';
import { BattleResultUnitCard } from '../BattleResultUnitCard';
import { Button } from '../../ui/Button';
import { scaled, centerX } from '../../ui/layout';
import { UI_THEME, fontSize } from '../../ui/theme';

export interface BattleResultsPanelConfig {
  scene:      Phaser.Scene;
  w:          number;
  h:          number;
  units:      BattleResultUnit[];
  onContinue: () => void;
}

export class BattleResultsPanel {
  constructor(cfg: BattleResultsPanelConfig) {
    const { scene, w, h, units, onContinue } = cfg;

    scene.add.rectangle(w / 2, h / 2, w, h, UI_THEME.color.background.victory);

    scene.add.text(w / 2, scaled(60), 'VICTORY!', {
      fontSize:        fontSize('h1'),
      color:           UI_THEME.color.value.highlight,
      fontStyle:       'bold',
      stroke:          UI_THEME.color.text.titleStroke,
      strokeThickness: scaled(4),
    }).setOrigin(0.5);

    this.placeCards(scene, units, w, h);

    new Button({
      scene,
      x:       w / 2,
      y:       h - scaled(60),
      w:       scaled(200),
      h:       scaled(52),
      label:   'Continue',
      style:   'navy',
      onClick: onContinue,
    });
  }

  private placeCards(
    scene: Phaser.Scene,
    units: BattleResultUnit[],
    w: number,
    h: number,
  ): void {
    const cardW  = scaled(110);
    const cardH  = scaled(160);
    const gap    = scaled(20);
    const totalW = units.length * cardW + (units.length - 1) * gap;
    const startX = centerX(w, totalW) + Math.round(cardW / 2);
    const cardY  = Math.round(h * 0.48);

    units.forEach((unit, i) => {
      new BattleResultUnitCard({
        scene,
        x:      startX + i * (cardW + gap),
        y:      cardY,
        width:  cardW,
        height: cardH,
        unit,
      });
    });
  }
}
