import Phaser from "phaser";
import { UpgradeOptionSnapshot } from "../core/phases";
import { LAYOUT_SCALE } from "../core/Constants";
import { UI_THEME, fontSize } from "../ui/theme";
import { BATTLE_VISUAL_THEME } from "./battleVisualTheme";
import { SkillIconView } from "./SkillIconView";

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

    const iconSz = Math.round(36 * LAYOUT_SCALE);
    const previewSz = Math.round(48 * LAYOUT_SCALE);
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

    // ── Top skill row: icon top-left, name immediately to its right ──────────────
    const skillIcon = new SkillIconView(scene, pad, pad, iconSz, upgrade.skill, alpha);
    this.add(skillIcon);

    const skillNameText = scene.add
      .text(pad + iconSz + gap, pad + iconSz / 2, upgrade.skill.name, {
        fontSize: fontSize("sm"),
        color: UI_THEME.color.value.neutral,
        fontStyle: "bold",
        wordWrap: { width: w - iconSz - pad * 3 }, // stops before the right edge
      })
      .setOrigin(0, 0.5)
      .setAlpha(alpha);
    this.add(skillNameText);

    // ── Optional upgraded-unit preview: lower-right, separate from the skill icon ─
    const previewKey = upgrade.unitPreviewTextureKey;
    const hasPreview = !!previewKey && scene.textures.exists(previewKey);
    if (hasPreview) {
      const img = scene.add
        .image(w - pad - previewSz / 2, h - pad - previewSz / 2, previewKey!)
        .setDisplaySize(previewSz, previewSz) // upgrade sprites are square frames
        .setAlpha(alpha);
      this.add(img);
    }

    // ── Content lines start below the top skill row ──────────────────────────────
    const skillRowBottom = pad + Math.max(iconSz, skillNameText.height);
    let textY = skillRowBottom + gap;
    // reserve right space only on the preview row band
    const textW = hasPreview ? w - previewSz - pad * 3 : w - pad * 2;

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
