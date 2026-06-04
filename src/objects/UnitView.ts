import Phaser from 'phaser';
import { CELL_SIZE, CELL_GAP, LAYOUT_SCALE } from '../core/Constants';
import { BATTLE_VISUAL_THEME } from './battleVisualTheme';
import { SpriteState, SpriteSheetConfig } from '../shared/unitTypes';
import type { BattleUnitSnapshot, FieldBattleUnitSnapshot } from '../shared/battleSnapshots';
import { EffectTooltip } from './EffectTooltip';
import { UI_THEME, fontSize } from '../ui/theme';
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
    unit: FieldBattleUnitSnapshot,
    colSpan: number,
    rowSpan: number,
    textureKey?: string,
    spriteConfig?: SpriteSheetConfig,
    effectTooltip?: EffectTooltip
  ) {
    super(scene, x, y);
    this.effectTooltip = effectTooltip;
    this.isPlayer = unit.side === 'player';

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
      const color = this.isPlayer ? BATTLE_VISUAL_THEME.unit.player : BATTLE_VISUAL_THEME.unit.enemy;
      this.bgSprite = scene.add.rectangle(0, 0, w, h, color, 0.85);
    }

    const labelColor = this.isPlayer ? BATTLE_VISUAL_THEME.unit.labelPlayer : BATTLE_VISUAL_THEME.unit.labelEnemy;
    this.nameText = scene.add.text(0, -h / 2 + Math.round(10 * LAYOUT_SCALE), unit.name, {
      fontSize: fontSize('md'),
      color: labelColor,
      fontStyle: 'bold',
      align: 'center',
      stroke: BATTLE_VISUAL_THEME.unit.textStroke,
      strokeThickness: Math.round(3 * LAYOUT_SCALE),
    }).setOrigin(0.5, 0);

    this.hpText = scene.add.text(0, h / 2 - Math.round(24 * LAYOUT_SCALE), `${unit.hp}/${unit.maxHp}`, {
      fontSize: fontSize('sm'),
      color: BATTLE_VISUAL_THEME.unit.textDark,
      align: 'center',
      stroke: BATTLE_VISUAL_THEME.unit.textStroke,
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

    // Apply the initial snapshot through the same render path live updates use.
    // A dead unit included in the initial phase.fieldUnits must render dead immediately.
    this.update(unit);
  }

  /**
   * Move the whole unit container to a new grid-derived center.
   * Game.ts owns grid geometry and decides the target; this is the apply surface.
   *
   * NOTE: when a unit has active effects, callers must reposition BEFORE update(),
   * because updateEffectSquares() snapshots the container position to compute
   * effect-tooltip world coordinates. syncUnitViews() in Game.ts honors this order.
   */
  reposition(x: number, y: number): void {
    this.setPosition(x, y);
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

  update(unit: FieldBattleUnitSnapshot): void {
    if (unit.lifeState === 'dead') {
      this.applyDeadVisual();
      this.hpText.setText('DEAD');
      this.hpBar.setRatio(0);
      this.clearEffectSquares();
      return;
    }

    this.applyAliveVisual();
    // Unit alive — only update HP display; Game.ts manages attack/idle transitions via setSpriteState()
    this.hpBar.setRatio(unit.maxHp > 0 ? unit.hp / unit.maxHp : 0);
    this.hpText.setText(`${unit.hp}/${unit.maxHp}`);
    this.updateEffectSquares(unit);
  }

  private applyDeadVisual(): void {
    this.isDead = true;
    this.setSpriteState('death');

    if (this.bgSprite instanceof Phaser.GameObjects.Rectangle) {
      (this.bgSprite as Phaser.GameObjects.Rectangle).setFillStyle(BATTLE_VISUAL_THEME.unit.dead, 0.4);
    } else {
      (this.bgSprite as Phaser.GameObjects.Image).setTint(BATTLE_VISUAL_THEME.unit.deadTint).setAlpha(0.6);
    }
    this.nameText.setAlpha(0.4);
    this.hpText.setAlpha(0.5);
  }

  // Reversal path. Future resurrection may revive either side mid-battle,
  // so a view that previously rendered dead must be able to render alive again.
  private applyAliveVisual(): void {
    if (!this.isDead) return;
    // Clear isDead BEFORE calling setSpriteState('idle'); the guard in
    // setSpriteState blocks transitions out of 'death' while isDead is true.
    this.isDead = false;
    this.setSpriteState('idle');

    if (this.bgSprite instanceof Phaser.GameObjects.Rectangle) {
      const color = this.isPlayer ? BATTLE_VISUAL_THEME.unit.player : BATTLE_VISUAL_THEME.unit.enemy;
      (this.bgSprite as Phaser.GameObjects.Rectangle).setFillStyle(color, 0.85);
    } else {
      (this.bgSprite as Phaser.GameObjects.Image).clearTint().setAlpha(1);
    }
    this.nameText.setAlpha(1);
    this.hpText.setAlpha(1);
  }

  private clearEffectSquares(): void {
    for (const sq of this.effectSquares) sq.destroy();
    this.effectSquares = [];
    for (const lbl of this.effectLabels) lbl.destroy();
    this.effectLabels = [];
  }

  private updateEffectSquares(unit: BattleUnitSnapshot): void {
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
      const color = ae.effect.effectTone === 'positive'
        ? UI_THEME.color.hp.high
        : UI_THEME.color.hp.low;
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
        color: UI_THEME.color.value.white,
        fontStyle: 'bold',
        stroke: BATTLE_VISUAL_THEME.unit.textStroke,
        strokeThickness: Math.round(2 * LAYOUT_SCALE),
      }).setOrigin(0.5, 0.5);
      this.add(lbl);
      this.effectLabels.push(lbl);
    });
  }
}
