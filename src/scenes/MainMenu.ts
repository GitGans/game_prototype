import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { GameState } from "../core/GameState";
import { PhaseManager } from "../core/PhaseManager";
import { Button } from "../ui/Button";

export class MainMenu extends Phaser.Scene {
  constructor() {
    super("MainMenu");
  }

  create(): void {
    GameState.initItemsIfNeeded();

    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(w / 2, h / 2, w, h, 0x1a1a2e);

    this.add
      .text(w / 2, h / 2 - Math.round(80 * LAYOUT_SCALE), "BATTLE TACTICS", {
        fontSize: `${Math.round(56 * LAYOUT_SCALE)}px`,
        color: "#ffdd44",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: Math.round(5 * LAYOUT_SCALE),
      })
      .setOrigin(0.5);

    const btnW = Math.round(200 * LAYOUT_SCALE);
    const btnH = Math.round(56 * LAYOUT_SCALE);
    const btnY = h / 2 + Math.round(40 * LAYOUT_SCALE);

    new Button({
      scene: this, x: w / 2, y: btnY, w: btnW, h: btnH,
      label: "Play", style: "primary",
      onClick: () => PhaseManager.transition({ type: 'play' }),
    });

    new Button({
      scene: this, x: w / 2, y: btnY + Math.round(70 * LAYOUT_SCALE), w: btnW, h: btnH,
      label: "Debug Battle", style: "dark",
      onClick: () => PhaseManager.transition({ type: 'debug' }),
    });
  }
}
