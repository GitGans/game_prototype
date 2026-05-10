import Phaser from 'phaser';
import { PLAYER_UNITS, ENEMY_UNITS } from '../data/units';
import { ITEM_DEFINITIONS } from '../data/itemDefinitions';
import type { SpriteSheetConfig, UnitRace } from '../shared/unitTypes';
import { getUnitSpriteTextureKey } from '../core/unitSpriteKey';
import { getPlayerUnitSpriteSheet, getEnemyUnitSpriteSheet } from '../core/unitSprites';

export class Preloader extends Phaser.Scene {
  constructor() {
    super('Preloader');
  }

  preload(): void {
    const toLoad = new Map<string, SpriteSheetConfig>();

    for (const bp of PLAYER_UNITS) {
      if (bp.spriteFilename) {
        const sheet = getPlayerUnitSpriteSheet(bp.spriteFilename);
        toLoad.set(getUnitSpriteTextureKey(bp.templateId, sheet), sheet);
      }
      for (const tier of (bp.upgradeTiers ?? [])) {
        for (const option of tier.options) {
          if (option.spriteFilename) {
            const sheet = getPlayerUnitSpriteSheet(option.spriteFilename);
            toLoad.set(getUnitSpriteTextureKey(bp.templateId, sheet), sheet);
          }
        }
      }
    }

    for (const [race, units] of Object.entries(ENEMY_UNITS)) {
      for (const bp of units) {
        if (bp.spriteFilename) {
          const sheet = getEnemyUnitSpriteSheet(race as UnitRace, bp.spriteFilename);
          toLoad.set(getUnitSpriteTextureKey(bp.templateId, sheet), sheet);
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
