import Phaser from 'phaser';
import { PhaseManager } from '../core/PhaseManager';
import { Button } from '../ui/Button';
import { scaled, centerX } from '../ui/layout';
import { UI_THEME, fontSize } from '../ui/theme';
import type { BattleResultUnit } from '../core/phases';
import { BattleResultUnitCard } from '../objects/BattleResultUnitCard';

export class BattleResults extends Phaser.Scene {
  constructor() { super('BattleResults'); }

  create(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'battle_results') return;

    const { width: w, height: h } = this.scale;

    this.add.rectangle(w / 2, h / 2, w, h, UI_THEME.color.background.victory);

    this.add.text(w / 2, scaled(60), 'VICTORY!', {
      fontSize:        fontSize('h1'),
      color:           UI_THEME.color.value.highlight,
      fontStyle:       'bold',
      stroke:          '#000000',
      strokeThickness: scaled(4),
    }).setOrigin(0.5);

    this.placeCards(phase.units, w, h);

    new Button({
      scene:   this,
      x:       w / 2,
      y:       h - scaled(60),
      w:       scaled(200),
      h:       scaled(52),
      label:   'Continue',
      style:   'navy',
      onClick: () => PhaseManager.transition({ type: 'exit_results' }),
    });
  }

  private placeCards(units: BattleResultUnit[], w: number, h: number): void {
    const cardW  = scaled(110);
    const cardH  = scaled(160);
    const gap    = scaled(20);
    const totalW = units.length * cardW + (units.length - 1) * gap;
    // centerX returns left edge of the total row block; + cardW/2 = center of first card
    const startX = centerX(w, totalW) + Math.round(cardW / 2);
    const cardY  = Math.round(h * 0.48);

    units.forEach((unit, i) => {
      new BattleResultUnitCard({
        scene:  this,
        x:      startX + i * (cardW + gap),
        y:      cardY,
        width:  cardW,
        height: cardH,
        unit,
      });
    });
  }
}
