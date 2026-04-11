import Phaser from 'phaser';
import { PLAYER_UNITS, ENEMY_UNITS } from '../data/unitDefinitions';
import { ITEM_DEFINITIONS } from '../data/itemDefinitions';

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

    // load item sprites
    for (const def of Object.values(ITEM_DEFINITIONS)) {
      if (def.sprite) {
        this.load.image(`sprite-item-${def.id}`, def.sprite);
      }
    }
  }

  create(): void {
    this.scene.start('MainMenu');
  }
}
