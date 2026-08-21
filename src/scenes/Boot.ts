import Phaser from 'phaser';
import { PhaseManager } from '../core/PhaseManager';
import { PhaserSceneSynchronizer } from './phaserSceneSynchronizer';

export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }

  create(): void {
    PhaseManager.init(new PhaserSceneSynchronizer(this.game));
    this.scene.start('Preloader'); // exempt: infrastructure bootstrap
  }
}
