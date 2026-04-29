import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { PhaseManager } from "../core/PhaseManager";
import { Button } from "../ui/Button";
import { UI_THEME } from "../ui/theme";

export class MainMenu extends Phaser.Scene {
  constructor() {
    super("MainMenu");
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(w / 2, h / 2, w, h, UI_THEME.color.background.default);

    this.add
      .text(w / 2, h / 2 - Math.round(80 * LAYOUT_SCALE), "BATTLE TACTICS", {
        fontSize: `${Math.round(56 * LAYOUT_SCALE)}px`,
        color: UI_THEME.color.value.highlight,
        fontStyle: "bold",
        stroke: UI_THEME.color.text.titleStroke,
        strokeThickness: Math.round(5 * LAYOUT_SCALE),
      })
      .setOrigin(0.5);

    const btnW = Math.round(200 * LAYOUT_SCALE);
    const btnH = Math.round(56 * LAYOUT_SCALE);
    const btnY = h / 2 + Math.round(40 * LAYOUT_SCALE);

    new Button({
      scene: this, x: w / 2, y: btnY, w: btnW, h: btnH,
      label: "Play", style: "primary",
      onClick: () => PhaseManager.transition({ type: 'new_game' }),
    });

    new Button({
      scene: this, x: w / 2, y: btnY + Math.round(70 * LAYOUT_SCALE), w: btnW, h: btnH,
      label: "Debug Battle", style: "dark",
      onClick: () => PhaseManager.transition({ type: 'debug' }),
    });
  }
}
