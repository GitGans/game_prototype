import Phaser from 'phaser';
import { PhaseManager } from '../core/PhaseManager';

export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }

  create(): void {
    PhaseManager.init(this.game);
    this.scene.start('Preloader'); // exempt: infrastructure bootstrap
  }
}
