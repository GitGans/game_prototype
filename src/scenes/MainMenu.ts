import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { GameState } from "../core/GameState";

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

    const btn = this.add
      .rectangle(w / 2, btnY, btnW, btnH, 0x2a6a2a)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(w / 2, btnY, "Play", {
        fontSize: `${Math.round(26 * LAYOUT_SCALE)}px`,
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    btn.on("pointerover", () => btn.setFillStyle(0x3a8a3a));
    btn.on("pointerout",  () => btn.setFillStyle(0x2a6a2a));
    btn.on("pointerup",   () => this.scene.start("Prep"));
  }
}
