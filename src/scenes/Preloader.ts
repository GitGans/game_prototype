import Phaser from 'phaser';
import { PLAYER_UNITS, ENEMY_UNITS } from '../data/units';
import { ITEM_DEFINITIONS } from '../data/itemDefinitions';
import { SKILLS } from '../data/skills';
import type { SpriteSheetConfig, UnitRace } from '../shared/unitTypes';
import type { ActionSkillDefinition } from '../shared/skillDefinitionTypes';
import { getUnitSpriteTextureKey, getSkillIconTextureKey } from '../core/unitSpriteKey';
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
          if (option.unitSpriteFilename) {
            const sheet = getPlayerUnitSpriteSheet(option.unitSpriteFilename);
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

    // skill icons — single images, keyed by skill id; missing files just won't load (fallback handles it).
    // Cast required: `SKILLS satisfies Record<…>` keeps narrow per-entry literal types, so Object.values
    // yields a union where `skillIconFilename` only exists on members that declare it. Widening to
    // ActionSkillDefinition[] lets us read the optional field uniformly without changing the SKILLS shape.
    for (const skill of Object.values(SKILLS) as ActionSkillDefinition[]) {
      if (skill.skillIconFilename) {
        this.load.image(
          getSkillIconTextureKey(skill.id),
          `assets/sprites/skills/${skill.skillIconFilename}`,
        );
      }
    }
  }

  create(): void {
    this.scene.start('MainMenu');
  }
}
