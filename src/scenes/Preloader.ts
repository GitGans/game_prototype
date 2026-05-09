import Phaser from 'phaser';
import { PLAYER_UNITS, ENEMY_UNITS } from '../data/units';
import { ITEM_DEFINITIONS } from '../data/itemDefinitions';
import { SpriteSheetConfig } from '../battle/types';
import { getUnitSpriteTextureKey } from '../core/unitSpriteKey';

export class Preloader extends Phaser.Scene {
  constructor() {
    super('Preloader');
  }

  preload(): void {
    const toLoad = new Map<string, SpriteSheetConfig>();

    const allUnits = [...PLAYER_UNITS, ...Object.values(ENEMY_UNITS).flat()];
    for (const bp of allUnits) {
      if (bp.spriteSheet) {
        toLoad.set(getUnitSpriteTextureKey(bp.templateId, bp.spriteSheet), bp.spriteSheet);
      }
      for (const tier of (bp.upgradeTiers ?? [])) {
        for (const option of tier.options) {
          if (option.spriteSheet) {
            toLoad.set(getUnitSpriteTextureKey(bp.templateId, option.spriteSheet), option.spriteSheet);
          }
        }
      }
    }

    for (const [key, sheet] of toLoad) {
      this.load.spritesheet(key, sheet.path, {
        frameWidth:  sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }

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
