import Phaser from 'phaser';
import type { BattleUnitSnapshot } from '../shared/battleSnapshots';
import { LAYOUT_SCALE } from '../core/Constants';
import { BATTLE_VISUAL_THEME } from './battleVisualTheme';
import { getUnitSpriteTextureKey } from '../core/unitSpriteKey';
import { fontSize, UI_THEME } from '../ui/theme';
import { HpBar } from '../ui/HpBar';

const CARD_GAP    = Math.round(5  * LAYOUT_SCALE);
const DIVIDER_GAP = Math.round(14 * LAYOUT_SCALE);
const ACTIVE_LIFT = Math.round(8  * LAYOUT_SCALE);

export class InitiativeBar extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);
  }

  update(snapshot: { roundQueue: string[]; unitsById: Map<string, BattleUnitSnapshot> }): void {
    this.removeAll(true);

    const { roundQueue, unitsById } = snapshot;
    const nextRound = this.buildNextRound(unitsById);

    // ── Card size: fit MAX_CARDS across full screen width ──────────────────
    const MAX_CARDS = 18;
    const canvasW = this.scene.scale.width;
    const DIVIDER_TOTAL = DIVIDER_GAP * 2 + Math.round(2 * LAYOUT_SCALE);
    const CARD_W = Math.floor(
      (canvasW - DIVIDER_TOTAL - CARD_GAP * (MAX_CARDS - 1)) / MAX_CARDS
    );
    const CARD_H = CARD_W;

    // ── Limit displayed cards to MAX_CARDS (current-round priority) ─────────
    const currentSlots     = Math.min(roundQueue.length, MAX_CARDS);
    const nextSlots        = Math.min(nextRound.length, MAX_CARDS - currentSlots);
    const displayedCurrent = roundQueue.slice(0, currentSlots);
    const displayedNext    = nextRound.slice(0, nextSlots);

    // ── Total width for centering ────────────────────────────────────────────
    const totalCards = displayedCurrent.length + displayedNext.length;
    const totalWidth =
      totalCards * (CARD_W + CARD_GAP) - CARD_GAP +
      (displayedNext.length > 0 ? DIVIDER_TOTAL : 0);

    let curX = (canvasW - totalWidth) / 2;

    // ── Current round ────────────────────────────────────────────────────────
    for (let i = 0; i < displayedCurrent.length; i++) {
      const unit = unitsById.get(displayedCurrent[i]);
      if (!unit) continue;
      const isActive = i === 0;
      const cardY = isActive ? -ACTIVE_LIFT : 0;
      this.drawCard(curX, cardY, unit, isActive, 1.0, CARD_W, CARD_H);
      curX += CARD_W + CARD_GAP;
    }

    // ── Divider ──────────────────────────────────────────────────────────────
    if (displayedNext.length > 0) {
      const divX = curX - CARD_GAP + DIVIDER_GAP;
      const divider = this.scene.add.rectangle(
        divX,
        -Math.round(4 * LAYOUT_SCALE),
        Math.round(2 * LAYOUT_SCALE),
        CARD_H + Math.round(8 * LAYOUT_SCALE),
        BATTLE_VISUAL_THEME.initiative.divider
      );
      this.add(divider);
      curX = divX + DIVIDER_GAP;

      // ── Next round (dimmed) ──────────────────────────────────────────────
      for (let i = 0; i < displayedNext.length; i++) {
        const unit = displayedNext[i];
        this.drawCard(curX, 0, unit, false, 0.65, CARD_W, CARD_H);
        curX += CARD_W + CARD_GAP;
      }
    }
  }

  private drawCard(
    x: number,
    y: number,
    unit: BattleUnitSnapshot,
    isActive: boolean,
    alpha: number,
    CARD_W: number,
    CARD_H: number
  ): void {
    const isPlayer = unit.anchor.side === 'player';
    const baseColor = isPlayer ? BATTLE_VISUAL_THEME.unit.player : BATTLE_VISUAL_THEME.unit.enemy;
    const borderColor = isActive ? BATTLE_VISUAL_THEME.cell.selected : BATTLE_VISUAL_THEME.cell.border;

    const border = this.scene.add.rectangle(
      x + CARD_W / 2, y + CARD_H / 2,
      CARD_W, CARD_H,
      borderColor, alpha
    );

    // Sprite or fallback colored rect
    const spriteKey = unit.spriteSheet
      ? getUnitSpriteTextureKey(unit.templateId, unit.spriteSheet)
      : null;
    const hasSprite = !!spriteKey && this.scene.textures.exists(spriteKey);

    let bg: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    if (hasSprite) {
      bg = this.scene.add.image(x + CARD_W / 2, y + CARD_H / 2, spriteKey!);
      (bg as Phaser.GameObjects.Image).setFrame(0); // idle frame
      bg.setDisplaySize(
        CARD_W - Math.round(3 * LAYOUT_SCALE),
        CARD_H - Math.round(3 * LAYOUT_SCALE)
      );
      bg.setAlpha(alpha);
    } else {
      bg = this.scene.add.rectangle(
        x + CARD_W / 2, y + CARD_H / 2,
        CARD_W - Math.round(3 * LAYOUT_SCALE),
        CARD_H - Math.round(3 * LAYOUT_SCALE),
        baseColor, alpha
      );
    }

    // Name — only shown when no sprite
    const nameText = hasSprite
      ? null
      : this.scene.add.text(
          x + CARD_W / 2, y + Math.round(10 * LAYOUT_SCALE),
          unit.name,
          {
            fontSize: fontSize('xs'),
            color: isPlayer ? BATTLE_VISUAL_THEME.unit.labelPlayer : BATTLE_VISUAL_THEME.unit.labelEnemy,
            align: 'center',
          }
        ).setOrigin(0.5, 0).setAlpha(alpha);

    const effInit = unit.effectiveInitiative;
    const initColor = effInit > unit.initiative ? UI_THEME.color.value.positive
                    : effInit < unit.initiative ? UI_THEME.color.value.negative
                    : BATTLE_VISUAL_THEME.unit.textLight;
    const initText = this.scene.add.text(
      x + CARD_W / 2, y + CARD_H - Math.round(18 * LAYOUT_SCALE),
      `★${effInit}`,
      {
        fontSize: fontSize('sm'),
        color: initColor,
        fontStyle: 'bold',
        align: 'center',
      }
    ).setOrigin(0.5, 0).setAlpha(alpha);

    const hpBgH = Math.max(3, Math.round(4 * LAYOUT_SCALE));
    const barInnerW = CARD_W - Math.round(3 * LAYOUT_SCALE);
    const hpBar = new HpBar({
      scene: this.scene,
      x: x + CARD_W / 2,
      y: y + CARD_H - hpBgH / 2,
      width: barInnerW,
      height: hpBgH,
      ratio: unit.hp / unit.maxHp,
      alpha,
      tricolor: true,
    });

    const toAdd: Phaser.GameObjects.GameObject[] = [border, bg, initText, hpBar];
    if (nameText) toAdd.splice(2, 0, nameText);
    this.add(toAdd);
  }

  private buildNextRound(unitsById: Map<string, BattleUnitSnapshot>): BattleUnitSnapshot[] {
    return Array.from(unitsById.values())
      .filter(u => u.hp > 0)
      .sort((a, b) => {
        if (b.effectiveInitiative !== a.effectiveInitiative)
          return b.effectiveInitiative - a.effectiveInitiative;
        if (a.anchor.side !== b.anchor.side) return a.anchor.side === 'player' ? -1 : 1;
        return 0;
      });
  }
}
