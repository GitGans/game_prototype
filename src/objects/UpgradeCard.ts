import Phaser from 'phaser';
import { UpgradeOptionSnapshot } from '../core/phases';
import { LAYOUT_SCALE } from '../core/Constants';
import { fontSize, VALUE_COLOR, BTN, ALPHA } from '../ui/theme';

export const CARD_W = Math.round(160 * LAYOUT_SCALE);
export const CARD_H = Math.round(200 * LAYOUT_SCALE);

export type UpgradeCardStatus = 'chosen' | 'available' | 'locked';

export class UpgradeCard extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    upgrade: UpgradeOptionSnapshot,
    status: UpgradeCardStatus,
    onClick: () => void,
    w = CARD_W,
    h = CARD_H,
  ) {
    super(scene, x, y);

    const spriteSz = Math.round(h * 0.35);
    const pad      = Math.round(8  * LAYOUT_SCALE);
    const line     = Math.round(14 * LAYOUT_SCALE);

    const alpha = status === 'locked' ? ALPHA.disabled : ALPHA.active;
    const borderColor = status === 'chosen' ? 0xffdd44 : status === 'available' ? 0x44aa44 : 0x445566;

    const bg = scene.add.rectangle(0, 0, w, h, 0x1a1a2e).setOrigin(0, 0).setAlpha(alpha);
    const border = scene.add.rectangle(0, 0, w, h, 0, 0)
      .setOrigin(0, 0).setStrokeStyle(2, borderColor).setAlpha(alpha);
    this.add([bg, border]);

    const spriteKey = upgrade.spriteKey;
    if (spriteKey && scene.textures.exists(spriteKey)) {
      const img = scene.add.image(w / 2, pad + spriteSz / 2, spriteKey)
        .setDisplaySize(spriteSz, spriteSz).setAlpha(alpha);
      this.add(img);
    } else {
      const ph = scene.add.rectangle(w / 2, pad + spriteSz / 2, spriteSz, spriteSz, 0x4a4a6a)
        .setAlpha(alpha);
      this.add(ph);
    }

    let textY = pad + spriteSz + pad;

    const nameText = scene.add.text(pad, textY, upgrade.name, {
      fontSize: fontSize('sm'),
      color: VALUE_COLOR.neutral,
      fontStyle: 'bold',
      wordWrap: { width: w - pad * 2 },
    }).setOrigin(0, 0).setAlpha(alpha);
    this.add(nameText);
    textY += nameText.height + Math.round(4 * LAYOUT_SCALE);

    const bonusEntries = Object.entries(upgrade.statBonuses) as [string, number][];
    for (const [stat, val] of bonusEntries) {
      if (!val) continue;
      const sign = val > 0 ? '+' : '';
      const color = val > 0 ? VALUE_COLOR.positive : VALUE_COLOR.negative;
      const label = scene.add.text(pad, textY, `${sign}${val} ${formatStat(stat)}`, {
        fontSize: fontSize('xs'),
        color,
      }).setOrigin(0, 0).setAlpha(alpha);
      this.add(label);
      textY += line;
    }

    if (upgrade.skill) {
      const skillText = scene.add.text(pad, textY, upgrade.skill.description, {
        fontSize: fontSize('xs'),
        color: VALUE_COLOR.muted,
        wordWrap: { width: w - pad * 2 },
      }).setOrigin(0, 0).setAlpha(alpha);
      this.add(skillText);
    }

    if (status === 'available') {
      const hit = scene.add.rectangle(0, 0, w, h, 0, 0)
        .setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => { bg.setFillStyle(BTN.neutral.hover); });
      hit.on('pointerout',  () => { bg.setFillStyle(0x1a1a2e); });
      hit.on('pointerdown', onClick);
      this.add(hit);
    }

    scene.add.existing(this);
  }
}

function formatStat(stat: string): string {
  const map: Record<string, string> = {
    hp: 'HP',
    physicalDamage: 'P.Dmg',
    magicalDamage: 'M.Dmg',
    physicalDefense: 'P.Def',
    magicalDefense: 'M.Def',
  };
  return map[stat] ?? stat;
}
