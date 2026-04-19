import Phaser from 'phaser';
import { LAYOUT_SCALE } from '../core/Constants';
import { PhaseManager } from '../core/PhaseManager';

export class MapVictory extends Phaser.Scene {
  constructor() {
    super('MapVictory');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(w / 2, h / 2, w, h, 0x1a2e1a);

    this.add
      .text(w / 2, h / 2 - Math.round(80 * LAYOUT_SCALE), 'VICTORY!', {
        fontSize: `${Math.round(64 * LAYOUT_SCALE)}px`,
        color: '#ffdd44',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: Math.round(5 * LAYOUT_SCALE),
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, h / 2 - Math.round(20 * LAYOUT_SCALE), 'All enemies have been defeated.', {
        fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
        color: '#aaffaa',
      })
      .setOrigin(0.5);

    const btnW = Math.round(220 * LAYOUT_SCALE);
    const btnH = Math.round(56 * LAYOUT_SCALE);
    const btnY = h / 2 + Math.round(60 * LAYOUT_SCALE);

    const btn = this.add
      .rectangle(w / 2, btnY, btnW, btnH, 0x2a2a6a)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(w / 2, btnY, 'Main Menu', {
        fontSize: `${Math.round(26 * LAYOUT_SCALE)}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x3a3a8a));
    btn.on('pointerout',  () => btn.setFillStyle(0x2a2a6a));
    btn.on('pointerup',   () => PhaseManager.transition({ type: 'exit_to_menu' }));
  }
}
