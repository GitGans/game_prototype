import Phaser from 'phaser';
import { PhaseManager } from '../core/PhaseManager';
import { Button } from '../ui/Button';
import { LAYOUT_SCALE } from '../core/Constants';
import { VALUE_COLOR, SCENE_BG } from '../ui/theme';
import { BattleResultUnit } from '../core/phases';

const S = LAYOUT_SCALE;

export class BattleResults extends Phaser.Scene {
  constructor() { super('BattleResults'); }

  create(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'battle_results') return;

    const { width: w, height: h } = this.scale;

    this.add.rectangle(w / 2, h / 2, w, h, SCENE_BG.victory);

    this.add.text(w / 2, Math.round(60 * S), 'VICTORY!', {
      fontSize:        `${Math.round(52 * S)}px`,
      color:           VALUE_COLOR.highlight,
      fontStyle:       'bold',
      stroke:          '#000000',
      strokeThickness: Math.round(4 * S),
    }).setOrigin(0.5);

    this.renderCards(phase.units, w, h);

    new Button({
      scene: this,
      x: w / 2,
      y: h - Math.round(60 * S),
      w: Math.round(200 * S),
      h: Math.round(52 * S),
      label: 'Continue',
      style: 'navy',
      onClick: () => PhaseManager.transition({ type: 'exit_results' }),
    });
  }

  private renderCards(units: BattleResultUnit[], w: number, h: number): void {
    const cardW  = Math.round(110 * S);
    const cardH  = Math.round(160 * S);
    const gap    = Math.round(20 * S);
    const totalW = units.length * cardW + (units.length - 1) * gap;
    const startX = w / 2 - totalW / 2 + cardW / 2;
    const cardY  = Math.round(h * 0.48);

    units.forEach((unit, i) => {
      this.renderCard(unit, startX + i * (cardW + gap), cardY, cardW, cardH);
    });
  }

  private renderCard(unit: BattleResultUnit, cx: number, cy: number, cw: number, ch: number): void {
    const alpha  = unit.isAlive ? 1 : 0.45;
    const sprKey = `sprite-${unit.templateId}`;
    const sprSz  = Math.round(72 * S);
    const sprY   = cy - Math.round(30 * S);

    this.add.rectangle(cx, cy, cw, ch, 0x1a1a2e)
      .setStrokeStyle(Math.round(1 * S), 0x44445a)
      .setAlpha(alpha);

    if (this.textures.exists(sprKey)) {
      this.add.image(cx, sprY, sprKey).setDisplaySize(sprSz, sprSz).setAlpha(alpha);
    } else {
      this.add.rectangle(cx, sprY, sprSz, sprSz, 0x556677).setAlpha(alpha);
    }

    this.add.text(cx, cy + Math.round(52 * S), unit.name, {
      fontSize: `${Math.round(13 * S)}px`, color: '#cccccc',
    }).setOrigin(0.5).setAlpha(alpha);

    this.add.text(cx, cy + Math.round(70 * S), `Lv ${unit.newLevel}`, {
      fontSize: `${Math.round(14 * S)}px`, color: VALUE_COLOR.highlight, fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, cy + Math.round(88 * S), '+1 lvl', {
      fontSize: `${Math.round(12 * S)}px`, color: VALUE_COLOR.positive,
    }).setOrigin(0.5);
  }
}
