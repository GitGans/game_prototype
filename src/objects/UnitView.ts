import Phaser from 'phaser';
import { CELL_SIZE, CELL_GAP, COLORS, LAYOUT_SCALE } from '../core/Constants';
import { Unit, SpriteState, SpriteSheetConfig } from '../battle/types';

export class UnitView extends Phaser.GameObjects.Container {
  private bgSprite: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private nameText: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFg: Phaser.GameObjects.Rectangle;
  private barH = 6;

  private readonly isPlayer: boolean;

  // Sprite state tracking (only used when bgSprite is an Image)
  private spriteConfig: SpriteSheetConfig | null = null;
  private isDead = false;

  // Buff/debuff squares
  private effectSquares: Phaser.GameObjects.Rectangle[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    unit: Unit,
    colSpan: number,
    rowSpan: number,
    textureKey?: string,
    spriteConfig?: SpriteSheetConfig
  ) {
    super(scene, x, y);
    this.isPlayer = unit.anchor.side === 'player';

    const pad   = Math.round(10 * LAYOUT_SCALE);
    const w     = rowSpan * CELL_SIZE + (rowSpan - 1) * CELL_GAP - pad;  // padded — used by rect and UI elements
    const h     = colSpan * CELL_SIZE + (colSpan - 1) * CELL_GAP - pad;
    const wFull = rowSpan * CELL_SIZE + (rowSpan - 1) * CELL_GAP;        // full cell — used by sprite
    const hFull = colSpan * CELL_SIZE + (colSpan - 1) * CELL_GAP;

    if (textureKey && scene.textures.exists(textureKey)) {
      this.spriteConfig = spriteConfig ?? null;
      const img = scene.add.image(0, 0, textureKey);
      // Show only the idle frame (column 0) via crop
      if (this.spriteConfig) {
        img.setFrame(0);
      }
      img.setDisplaySize(wFull, hFull);
      this.bgSprite = img;
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
    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject);
  }

  /**
   * Switch to a sprite state (idle / attack / death).
   * If the unit is already dead, only 'death' is allowed — other states are ignored.
   * Does nothing if bgSprite is a Rectangle (no sprite config).
   */
  setSpriteState(state: SpriteState): void {
    if (this.isDead && state !== 'death') return;
    if (!this.spriteConfig) return;
    if (!(this.bgSprite instanceof Phaser.GameObjects.Image)) return;

    const frameIndex = this.spriteConfig.states.indexOf(state);
    if (frameIndex === -1) return; // state not present in this sprite sheet

    this.bgSprite.setFrame(frameIndex);
  }

  update(unit: Unit | null): void {
    if (!unit || unit.hp <= 0) {
      this.isDead = true;
      this.setSpriteState('death');

      if (this.bgSprite instanceof Phaser.GameObjects.Rectangle) {
        (this.bgSprite as Phaser.GameObjects.Rectangle).setFillStyle(COLORS.unitDead, 0.4);
      } else {
        (this.bgSprite as Phaser.GameObjects.Image).setTint(0x888888).setAlpha(0.6);
      }

      this.nameText.setAlpha(0.4);
      this.hpText.setText('DEAD').setAlpha(0.5);
      this.hpBarFg.setDisplaySize(0, this.barH);

      for (const sq of this.effectSquares) sq.destroy();
      this.effectSquares = [];
      return;
    }

    // Unit alive — only update HP display; Game.ts manages attack/idle transitions via setState()
    const maxW = this.hpBarBg.width;
    const ratio = unit.hp / unit.maxHp;
    this.hpBarFg.setDisplaySize(maxW * ratio, this.barH);
    this.hpText.setText(`${unit.hp}/${unit.maxHp}`);

    this.updateEffectSquares(unit);
  }

  private updateEffectSquares(unit: Unit): void {
    for (const sq of this.effectSquares) sq.destroy();
    this.effectSquares = [];

    if (unit.activeEffects.length === 0) return;

    const sqSize = Math.round(12 * LAYOUT_SCALE);
    const gap = Math.round(3 * LAYOUT_SCALE);
    const baseY = this.hpBarBg.y + Math.round(11 * LAYOUT_SCALE);
    const totalW = unit.activeEffects.length * sqSize + (unit.activeEffects.length - 1) * gap;
    const startX = -totalW / 2 + sqSize / 2;

    unit.activeEffects.forEach((ae, i) => {
      const color = ae.effect.isBuff ? 0x22cc44 : 0xcc2222;
      const x = startX + i * (sqSize + gap);
      const sq = this.scene.add.rectangle(x, baseY, sqSize, sqSize, color, 0.9);
      this.add(sq);
      this.effectSquares.push(sq);
    });
  }
}
