import Phaser from "phaser";
import type { SkillIconSnapshot } from "../core/phases";
import { BATTLE_VISUAL_THEME } from "./battleVisualTheme";

/**
 * Skill icon at a fixed square size. Renders the loaded icon when its texture exists,
 * otherwise a fallback square with the skill name's first letter.
 * Pure visual — no tooltip, no input. Compose interaction in the parent.
 * Origin is top-left at (x, y).
 */
export class SkillIconView extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    size: number,
    skill: SkillIconSnapshot,
    alpha = 1,
  ) {
    super(scene, x, y);
    const t = BATTLE_VISUAL_THEME.skillIcon;
    const key = skill.iconTextureKey;
    const hasIcon = !!key && scene.textures.exists(key);

    if (hasIcon) {
      const img = scene.add
        .image(size / 2, size / 2, key!)
        .setDisplaySize(size, size)
        .setAlpha(alpha);
      this.add(img);
    } else {
      const square = scene.add
        .rectangle(0, 0, size, size, t.fallbackBg)
        .setOrigin(0, 0)
        .setStrokeStyle(1, t.fallbackBorder)
        .setAlpha(alpha);
      const letter = scene.add
        .text(size / 2, size / 2, (skill.name[0] ?? "?").toUpperCase(), {
          fontSize: `${Math.round(size * 0.5)}px`,
          color: t.fallbackText,
        })
        .setOrigin(0.5)
        .setAlpha(alpha);
      this.add([square, letter]);
    }
    scene.add.existing(this);
  }
}
