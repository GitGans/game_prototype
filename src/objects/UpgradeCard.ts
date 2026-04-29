import Phaser from 'phaser';
import { UpgradeOptionSnapshot } from '../core/phases';
import { LAYOUT_SCALE } from '../core/Constants';
import { UI_THEME, fontSize } from '../ui/theme';
import { BATTLE_VISUAL_THEME } from './battleVisualTheme';

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

    const alpha = status === 'locked' ? UI_THEME.alpha.disabled : UI_THEME.alpha.active;
    const borderColor =
      status === 'chosen'    ? BATTLE_VISUAL_THEME.upgradeCard.borderChosen    :
      status === 'available' ? BATTLE_VISUAL_THEME.upgradeCard.borderAvailable :
                               BATTLE_VISUAL_THEME.upgradeCard.borderLocked;

    const bg = scene.add.rectangle(0, 0, w, h, BATTLE_VISUAL_THEME.upgradeCard.bg).setOrigin(0, 0).setAlpha(alpha);
    const border = scene.add.rectangle(0, 0, w, h, 0, 0)
      .setOrigin(0, 0).setStrokeStyle(2, borderColor).setAlpha(alpha);
    this.add([bg, border]);

    const spriteKey = upgrade.spritePreview;
    if (spriteKey && scene.textures.exists(spriteKey)) {
      const img = scene.add.image(w / 2, pad + spriteSz / 2, spriteKey)
        .setDisplaySize(spriteSz, spriteSz).setAlpha(alpha);
      this.add(img);
    } else {
      const ph = scene.add.rectangle(w / 2, pad + spriteSz / 2, spriteSz, spriteSz, BATTLE_VISUAL_THEME.upgradeCard.placeholder)
        .setAlpha(alpha);
      this.add(ph);
    }

    let textY = pad + spriteSz + pad;

    const nameText = scene.add.text(pad, textY, upgrade.name, {
      fontSize: fontSize('sm'),
      color: UI_THEME.color.value.neutral,
      fontStyle: 'bold',
      wordWrap: { width: w - pad * 2 },
    }).setOrigin(0, 0).setAlpha(alpha);
    this.add(nameText);
    textY += nameText.height + Math.round(4 * LAYOUT_SCALE);

    for (const statLine of upgrade.statLines) {
      const color = statLine.tone === 'positive' ? UI_THEME.color.value.positive : UI_THEME.color.value.negative;
      const label = scene.add.text(pad, textY, statLine.text, {
        fontSize: fontSize('xs'),
        color,
      }).setOrigin(0, 0).setAlpha(alpha);
      this.add(label);
      textY += line;
    }

    if (upgrade.description) {
      const descText = scene.add.text(pad, textY, upgrade.description, {
        fontSize: fontSize('xs'),
        color: UI_THEME.color.value.muted,
        wordWrap: { width: w - pad * 2 },
      }).setOrigin(0, 0).setAlpha(alpha);
      this.add(descText);
    }

    if (status === 'available') {
      const hit = scene.add.rectangle(0, 0, w, h, 0, 0)
        .setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => { bg.setFillStyle(BATTLE_VISUAL_THEME.upgradeCard.hoverBg); });
      hit.on('pointerout',  () => { bg.setFillStyle(BATTLE_VISUAL_THEME.upgradeCard.bg); });
      hit.on('pointerdown', onClick);
      this.add(hit);
    }

    scene.add.existing(this);
  }
}
