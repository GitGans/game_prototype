import Phaser from "phaser";
import { UI_THEME } from "./theme";

export interface IconSquareViewConfig {
  scene:      Phaser.Scene;
  x:          number;
  y:          number;
  size:       number;
  textureKey: string | null;
  fallbackText: string;
  alpha?:     number;
  inset?:     number;
}

/**
 * Generic square icon. Renders `textureKey` if it exists, otherwise a neutral
 * fallback square with the first letter of `fallbackText`.
 * Top-left local placement at (x, y). Pure visual — no input, tooltip, or game data.
 * Does NOT call scene.add.existing(); the parent must add it to its container.
 */
export class IconSquareView extends Phaser.GameObjects.Container {
  constructor(cfg: IconSquareViewConfig) {
    super(cfg.scene, cfg.x, cfg.y);
    const { scene, size, textureKey, fallbackText } = cfg;
    const alpha = cfg.alpha ?? 1;
    const inset = cfg.inset ?? 0;
    const t = UI_THEME.component.iconSquare;

    const hasTexture = !!textureKey && scene.textures.exists(textureKey);

    if (hasTexture) {
      const img = scene.add
        .image(size / 2, size / 2, textureKey!)
        .setDisplaySize(size - inset * 2, size - inset * 2)
        .setAlpha(alpha);
      this.add(img);
    } else {
      const square = scene.add
        .rectangle(0, 0, size, size, t.fallbackBg)
        .setOrigin(0, 0)
        .setStrokeStyle(t.fallbackBorderWidth, t.fallbackBorder)
        .setAlpha(alpha);
      const letter = scene.add
        .text(size / 2, size / 2, (fallbackText[0] ?? "?").toUpperCase(), {
          fontSize: `${Math.round(size * t.fallbackLetterScale)}px`,
          color: t.fallbackText,
        })
        .setOrigin(0.5)
        .setAlpha(alpha);
      this.add([square, letter]);
    }
  }
}
