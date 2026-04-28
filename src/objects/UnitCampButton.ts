import Phaser from 'phaser';
import { LAYOUT_SCALE } from '../core/Constants';
import { Button } from '../ui/Button';

const BTN_W = Math.round(60 * LAYOUT_SCALE);
const BTN_H = Math.round(22 * LAYOUT_SCALE);

/**
 * Small toggle button placed on a unit portrait.
 * inCamp=false → shows "Camp ↓" ghost style (click sends to camp)
 * inCamp=true  → shows "Party ↑" neutral style (click returns to party)
 * No state mutation — caller owns the transition logic.
 */
export class UnitCampButton extends Phaser.GameObjects.Container {
  private btn: Button;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    inCamp: boolean,
    onClick: () => void,
  ) {
    super(scene, x, y);
    this.btn = new Button({
      scene,
      x: 0,
      y: 0,
      w: BTN_W,
      h: BTN_H,
      label: inCamp ? 'Party ↑' : 'Camp ↓',
      style: inCamp ? 'neutral' : 'ghost',
      onClick,
      fontKey: 'xs',
    });
    this.add(this.btn);
    scene.add.existing(this);
  }
}
