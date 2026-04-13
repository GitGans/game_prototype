import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { ActiveEffect } from "../battle/types";

const TW      = Math.round(160 * LAYOUT_SCALE);
const PAD     = Math.round(8   * LAYOUT_SCALE);
const FONT_MD = `${Math.round(12 * LAYOUT_SCALE)}px`;
const FONT_SM = `${Math.round(10 * LAYOUT_SCALE)}px`;
const LINE_H  = Math.round(15 * LAYOUT_SCALE);

export class EffectTooltip extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Rectangle;
  private nameTxt: Phaser.GameObjects.Text;
  private descTxt: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    this.bg = scene.add.rectangle(0, 0, TW, LINE_H * 2 + PAD * 2, 0x0d1520, 0.92);
    this.bg.setOrigin(0, 0);
    this.add(this.bg);

    this.nameTxt = scene.add.text(PAD, PAD, "", {
      fontSize: FONT_MD,
      color: "#ffffff",
      fontStyle: "bold",
      wordWrap: { width: TW - PAD * 2 },
    }).setOrigin(0, 0);
    this.add(this.nameTxt);

    this.descTxt = scene.add.text(PAD, PAD + LINE_H, "", {
      fontSize: FONT_SM,
      color: "#aaaaaa",
      wordWrap: { width: TW - PAD * 2 },
    }).setOrigin(0, 0);
    this.add(this.descTxt);

    this.setDepth(100);
    this.setVisible(false);
    scene.add.existing(this);
  }

  show(ae: ActiveEffect, squareWorldX: number, squareWorldY: number, isPlayer: boolean): void {
    let desc = ae.effect.description ?? "";
    if (ae.computedPerTurn !== undefined) {
      const sign = ae.effect.isBuff ? "+" : "-";
      desc += ` (${sign}${Math.abs(ae.computedPerTurn)} HP/round)`;
    }

    this.nameTxt.setText(ae.effectDisplayName);
    this.descTxt.setText(desc);

    const totalH = PAD + LINE_H + this.descTxt.height + PAD;
    this.bg.setSize(TW, totalH);

    const sqHalf = Math.round(12 * LAYOUT_SCALE);
    const GAP    = Math.round(6  * LAYOUT_SCALE);
    let tx: number;
    let ty: number;

    if (isPlayer) {
      tx = squareWorldX - sqHalf - GAP - TW;
    } else {
      tx = squareWorldX + sqHalf + GAP;
    }
    ty = squareWorldY - totalH / 2;

    const { width: sw, height: sh } = this.scene.scale;
    tx = Phaser.Math.Clamp(tx, 4, sw - TW - 4);
    ty = Phaser.Math.Clamp(ty, 4, sh - totalH - 4);

    this.setPosition(tx, ty);
    this.setVisible(true);
  }

  hide(): void {
    this.setVisible(false);
  }
}
