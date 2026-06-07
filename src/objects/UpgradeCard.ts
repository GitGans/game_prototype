import Phaser from "phaser";
import { UpgradeOptionSnapshot } from "../core/phases";
import { LAYOUT_SCALE } from "../core/Constants";
import { UI_THEME, fontSize } from "../ui/theme";
import { BATTLE_VISUAL_THEME } from "./battleVisualTheme";

export const CARD_W = Math.round(160 * LAYOUT_SCALE);
export const CARD_H = Math.round(200 * LAYOUT_SCALE);

export type UpgradeCardStatus = "chosen" | "available" | "locked";

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

    const spriteSz = Math.round(64 * LAYOUT_SCALE);
    const pad = Math.round(8 * LAYOUT_SCALE);
    const gap = Math.round(4 * LAYOUT_SCALE);

    const alpha =
      status === "locked" ? UI_THEME.alpha.disabled : UI_THEME.alpha.active;
    const borderColor =
      status === "chosen"
        ? BATTLE_VISUAL_THEME.upgradeCard.borderChosen
        : status === "available"
          ? BATTLE_VISUAL_THEME.upgradeCard.borderAvailable
          : BATTLE_VISUAL_THEME.upgradeCard.borderLocked;

    const bg = scene.add
      .rectangle(0, 0, w, h, BATTLE_VISUAL_THEME.upgradeCard.bg)
      .setOrigin(0, 0)
      .setAlpha(alpha);
    const border = scene.add
      .rectangle(0, 0, w, h, 0, 0)
      .setOrigin(0, 0)
      .setStrokeStyle(2, borderColor)
      .setAlpha(alpha);
    this.add([bg, border]);

    // Sprite preview: render only when the option has a loaded texture.
    // Right-aligned, vertically centered. No placeholder when absent.
    const spriteKey = upgrade.spritePreview;
    const hasSprite = !!spriteKey && scene.textures.exists(spriteKey);
    if (hasSprite) {
      const img = scene.add
        .image(w - pad - spriteSz / 2, h / 2, spriteKey!)
        .setDisplaySize(spriteSz, spriteSz) // upgrade sprites are square frames
        .setAlpha(alpha);
      this.add(img);
    }

    // Text occupies the left column; reserve room for the sprite only when one is shown.
    const textW = hasSprite ? w - spriteSz - pad * 3 : w - pad * 2;
    let textY = pad;

    const nameText = scene.add
      .text(pad, textY, upgrade.name, {
        fontSize: fontSize("sm"),
        color: UI_THEME.color.value.neutral,
        fontStyle: "bold",
        wordWrap: { width: textW },
      })
      .setOrigin(0, 0)
      .setAlpha(alpha);
    this.add(nameText);
    textY += nameText.height + gap;

    if (upgrade.classChangeName) {
      const classText = scene.add
        .text(pad, textY, `Class: ${upgrade.classChangeName}`, {
          fontSize: fontSize("xs"),
          color: UI_THEME.color.value.highlight,
          wordWrap: { width: textW },
        })
        .setOrigin(0, 0)
        .setAlpha(alpha);
      this.add(classText);
      textY += classText.height + gap;
    }

    for (const statLine of upgrade.statLines) {
      const color =
        statLine.tone === "positive"
          ? UI_THEME.color.value.positive
          : UI_THEME.color.value.negative;
      const label = scene.add
        .text(pad, textY, statLine.text, {
          fontSize: fontSize("xs"),
          color,
          wordWrap: { width: textW },
        })
        .setOrigin(0, 0)
        .setAlpha(alpha);
      this.add(label);
      textY += label.height + Math.round(2 * LAYOUT_SCALE);
    }

    if (status === "available") {
      const hit = scene.add
        .rectangle(0, 0, w, h, 0, 0)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerover", () => {
        bg.setFillStyle(BATTLE_VISUAL_THEME.upgradeCard.hoverBg);
      });
      hit.on("pointerout", () => {
        bg.setFillStyle(BATTLE_VISUAL_THEME.upgradeCard.bg);
      });
      hit.on("pointerdown", onClick);
      this.add(hit);
    }

    scene.add.existing(this);
  }
}
