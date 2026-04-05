import Phaser from 'phaser';
import { CELL_SIZE, CELL_GAP, COLORS, LAYOUT_SCALE } from '../core/Constants';
import { Unit } from '../battle/types';

export class UnitView extends Phaser.GameObjects.Container {
  private bgSprite: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private nameText: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFg: Phaser.GameObjects.Rectangle;
  private barH = 6;

  private readonly isPlayer: boolean;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    unit: Unit,
    colSpan: number,
    rowSpan: number,
    textureKey?: string
  ) {
    super(scene, x, y);
    this.isPlayer = unit.anchor.side === 'player';

    // row = horizontal axis, col = vertical axis
    const pad = Math.round(10 * LAYOUT_SCALE);
    const w = rowSpan * CELL_SIZE + (rowSpan - 1) * CELL_GAP - pad;
    const h = colSpan * CELL_SIZE + (colSpan - 1) * CELL_GAP - pad;

    if (textureKey && scene.textures.exists(textureKey)) {
      this.bgSprite = scene.add.image(0, 0, textureKey).setDisplaySize(w - 2, h - 2);
    } else {
      const color = this.isPlayer ? COLORS.unitPlayer : COLORS.unitEnemy;
      this.bgSprite = scene.add.rectangle(0, 0, w, h, color, 0.85);
    }

    const labelColor = this.isPlayer ? COLORS.label : COLORS.labelEnemy;
    this.nameText = scene.add.text(0, -h / 2 + Math.round(10 * LAYOUT_SCALE), unit.name, {
      fontSize: `${Math.round(13 * LAYOUT_SCALE)}px`,
      color: labelColor,
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: Math.round(3 * LAYOUT_SCALE),
    }).setOrigin(0.5, 0);

    this.hpText = scene.add.text(0, h / 2 - Math.round(24 * LAYOUT_SCALE), `${unit.hp}/${unit.maxHp}`, {
      fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
      color: COLORS.textDark,
      align: 'center',
      stroke: '#000000',
      strokeThickness: Math.round(2 * LAYOUT_SCALE),
    }).setOrigin(0.5, 0);

    const barW = w - Math.round(12 * LAYOUT_SCALE);
    const barH = Math.round(6 * LAYOUT_SCALE);
    this.barH = barH;
    this.hpBarBg = scene.add.rectangle(0, h / 2 - Math.round(10 * LAYOUT_SCALE), barW, barH, COLORS.hpBarBg);
    this.hpBarFg = scene.add.rectangle(
      -barW / 2, h / 2 - Math.round(10 * LAYOUT_SCALE), barW * (unit.hp / unit.maxHp), barH, COLORS.hpBarFg
    ).setOrigin(0, 0.5);

    this.add([this.bgSprite, this.nameText, this.hpText, this.hpBarBg, this.hpBarFg]);
    scene.add.existing(this);
  }

  update(unit: Unit | null): void {
    if (!unit || unit.hp <= 0) {
      if (this.bgSprite instanceof Phaser.GameObjects.Image) {
        this.bgSprite.setTint(0x333344).setAlpha(0.4);
      } else {
        (this.bgSprite as Phaser.GameObjects.Rectangle).setFillStyle(COLORS.unitDead, 0.4);
      }
      this.nameText.setAlpha(0.4);
      this.hpText.setText('DEAD').setAlpha(0.5);
      this.hpBarFg.setDisplaySize(0, this.barH);
      return;
    }

    const maxW = this.hpBarBg.width;
    const ratio = unit.hp / unit.maxHp;
    this.hpBarFg.setDisplaySize(maxW * ratio, this.barH);
    this.hpText.setText(`${unit.hp}/${unit.maxHp}`);
  }
}
