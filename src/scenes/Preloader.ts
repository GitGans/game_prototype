import Phaser from 'phaser';
import { PLAYER_UNITS, ENEMY_UNITS } from '../data/unitDefinitions';

export class Preloader extends Phaser.Scene {
  constructor() {
    super('Preloader');
  }

  preload(): void {
    const allUnits = [
      ...PLAYER_UNITS,
      ...Object.values(ENEMY_UNITS).flat(),
    ];
    for (const bp of allUnits) {
      if (bp.spriteSheet) {
        this.load.spritesheet(`sprite-${bp.templateId}`, bp.spriteSheet.path, {
          frameWidth:  bp.spriteSheet.frameWidth,
          frameHeight: bp.spriteSheet.frameHeight,
        });
      }
    }
  }

  create(): void {
    this.scene.start('Game');
  }
}
