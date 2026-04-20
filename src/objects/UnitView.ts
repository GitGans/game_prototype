import Phaser from 'phaser';
import { CELL_SIZE, CELL_GAP, COLORS, LAYOUT_SCALE } from '../core/Constants';
import { Unit, SpriteState, SpriteSheetConfig } from '../battle/types';
import { EffectTooltip } from './EffectTooltip';
import { fontSize, VALUE_COLOR, HP_COLOR } from '../ui/theme';
import { HpBar } from '../ui/HpBar';

export class UnitView extends Phaser.GameObjects.Container {
  private bgSprite: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private nameText: Phaser.GameObjects.Text;
  private hpText: Phaser.GameObjects.Text;
  private hpBar: HpBar;

  private readonly isPlayer: boolean;

  // Sprite state tracking (only used when bgSprite is an Image)
  private spriteConfig: SpriteSheetConfig | null = null;
  private isDead = false;

  // Buff/debuff squares
  private effectSquares: Phaser.GameObjects.Rectangle[] = [];
  private effectLabels: Phaser.GameObjects.Text[] = [];
  private effectTooltip?: EffectTooltip;
  private footprintW = 0;
  private footprintH = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    unit: Unit,
    colSpan: number,
    rowSpan: number,
    textureKey?: string,
    spriteConfig?: SpriteSheetConfig,
    effectTooltip?: EffectTooltip
  ) {
    super(scene, x, y);
    this.effectTooltip = effectTooltip;
    this.isPlayer = unit.anchor.side === 'player';

    const pad   = Math.round(10 * LAYOUT_SCALE);
    const w     = rowSpan * CELL_SIZE + (rowSpan - 1) * CELL_GAP - pad;  // padded — used by rect and UI elements
    const h     = colSpan * CELL_SIZE + (colSpan - 1) * CELL_GAP - pad;
    const wFull = rowSpan * CELL_SIZE + (rowSpan - 1) * CELL_GAP;        // full cell — used by sprite
    const hFull = colSpan * CELL_SIZE + (colSpan - 1) * CELL_GAP;
    this.footprintW = wFull;
    this.footprintH = hFull;

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
      fontSize: fontSize('md'),
      color: labelColor,
      fontStyle: 'bold',
      align: 'center',
      stroke: '#000000',
      strokeThickness: Math.round(3 * LAYOUT_SCALE),
    }).setOrigin(0.5, 0);

    this.hpText = scene.add.text(0, h / 2 - Math.round(24 * LAYOUT_SCALE), `${unit.hp}/${unit.maxHp}`, {
      fontSize: fontSize('sm'),
      color: COLORS.textDark,
      align: 'center',
      stroke: '#000000',
      strokeThickness: Math.round(2 * LAYOUT_SCALE),
    }).setOrigin(0.5, 0);

    const barW = w - Math.round(12 * LAYOUT_SCALE);
    const barH = Math.round(6 * LAYOUT_SCALE);
    this.hpBar = new HpBar({
      scene, x: 0, y: h / 2 - Math.round(10 * LAYOUT_SCALE),
      width: barW, height: barH,
      ratio: unit.hp / unit.maxHp,
      tricolor: false,
    });

    this.add([this.bgSprite, this.nameText, this.hpText, this.hpBar]);
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
      this.hpBar.setRatio(0);

      for (const sq of this.effectSquares) sq.destroy();
      this.effectSquares = [];
      for (const lbl of this.effectLabels) lbl.destroy();
      this.effectLabels = [];
      return;
    }

    // Unit alive — only update HP display; Game.ts manages attack/idle transitions via setState()
    this.hpBar.setRatio(unit.hp / unit.maxHp);
    this.hpText.setText(`${unit.hp}/${unit.maxHp}`);

    this.updateEffectSquares(unit);
  }

  private updateEffectSquares(unit: Unit): void {
    this.effectTooltip?.hide();

    for (const sq of this.effectSquares) sq.destroy();
    this.effectSquares = [];
    for (const lbl of this.effectLabels) lbl.destroy();
    this.effectLabels = [];

    if (unit.activeEffects.length === 0) return;

    const sqSize = Math.round(24 * LAYOUT_SCALE);
    const gap    = Math.round(3  * LAYOUT_SCALE);

    const topY  = -this.footprintH / 2 + sqSize / 2;
    const baseX = this.isPlayer
      ? -this.footprintW / 2 + sqSize / 2   // player → top-left
      :  this.footprintW / 2 - sqSize / 2;  // enemy  → top-right

    unit.activeEffects.forEach((ae, i) => {
      const color = ae.effect.isBuff ? HP_COLOR.high : HP_COLOR.low;
      const x = baseX;
      const y = topY + i * (sqSize + gap);

      const sq = this.scene.add.rectangle(x, y, sqSize, sqSize, color, 0.9);
      sq.setInteractive();

      const worldX = this.x + x;
      const worldY = this.y + y;
      sq.on('pointerover', () => {
        this.effectTooltip?.show(ae, worldX, worldY, this.isPlayer ? "left" : "right");
      });
      sq.on('pointerout', () => {
        this.effectTooltip?.hide();
      });

      this.add(sq);
      this.effectSquares.push(sq);

      const lbl = this.scene.add.text(x, y, String(ae.remainingRounds), {
        fontSize: fontSize('xs'),
        color: VALUE_COLOR.white,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: Math.round(2 * LAYOUT_SCALE),
      }).setOrigin(0.5, 0.5);
      this.add(lbl);
      this.effectLabels.push(lbl);
    });
  }
}
