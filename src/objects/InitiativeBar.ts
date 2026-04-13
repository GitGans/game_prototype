import Phaser from 'phaser';
import { BattleState, Unit } from '../battle/types';
import { COLORS, LAYOUT_SCALE } from '../core/Constants';
import { effectiveStats } from '../battle/combat';

const CARD_GAP    = Math.round(5  * LAYOUT_SCALE);
const DIVIDER_GAP = Math.round(14 * LAYOUT_SCALE);
const ACTIVE_LIFT = Math.round(8  * LAYOUT_SCALE);

export class InitiativeBar extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    scene.add.existing(this);
  }

  update(state: BattleState): void {
    this.removeAll(true);
    if (state.phase === 'end') return;

    const { units, roundQueue } = state;
    const nextRound = this.buildNextRound(units);

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
      const unit = units.get(displayedCurrent[i]);
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
        0x8899bb
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
    unit: Unit,
    isActive: boolean,
    alpha: number,
    CARD_W: number,
    CARD_H: number
  ): void {
    const isPlayer = unit.anchor.side === 'player';
    const baseColor = isPlayer ? COLORS.unitPlayer : COLORS.unitEnemy;
    const borderColor = isActive ? COLORS.cellSelected : COLORS.cellBorder;

    const border = this.scene.add.rectangle(
      x + CARD_W / 2, y + CARD_H / 2,
      CARD_W, CARD_H,
      borderColor, alpha
    );

    // Sprite or fallback colored rect
    const spriteKey = `sprite-${unit.templateId}`;
    const hasSprite = this.scene.textures.exists(spriteKey);

    let bg: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    if (hasSprite) {
      bg = this.scene.add.image(x + CARD_W / 2, y + CARD_H / 2, spriteKey);
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
            fontSize: `${Math.round(10 * LAYOUT_SCALE)}px`,
            color: isPlayer ? COLORS.label : COLORS.labelEnemy,
            align: 'center',
          }
        ).setOrigin(0.5, 0).setAlpha(alpha);

    const effInit = effectiveStats(unit).initiative;
    const initColor = effInit > unit.initiative ? '#44ff88'
                    : effInit < unit.initiative ? '#ff4444'
                    : COLORS.textLight;
    const initText = this.scene.add.text(
      x + CARD_W / 2, y + CARD_H - Math.round(18 * LAYOUT_SCALE),
      `★${effInit}`,
      {
        fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
        color: initColor,
        fontStyle: 'bold',
        align: 'center',
      }
    ).setOrigin(0.5, 0).setAlpha(alpha);

    // HP bar background — added before fill so fill renders on top
    const hpBgH = Math.max(3, Math.round(4 * LAYOUT_SCALE));
    const barInnerW = CARD_W - Math.round(3 * LAYOUT_SCALE);
    const hpBg = this.scene.add.rectangle(
      x + CARD_W / 2, y + CARD_H - hpBgH / 2,
      barInnerW, hpBgH,
      0x333333, alpha
    );

    const toAdd: Phaser.GameObjects.GameObject[] = [border, bg, initText, hpBg];
    if (nameText) toAdd.splice(2, 0, nameText);
    this.add(toAdd);

    // HP fill — added after hpBg so it renders on top
    const hpRatio = Math.max(0, unit.hp / unit.maxHp);
    const fillW = Math.round(barInnerW * hpRatio);
    if (fillW > 0) {
      const fillColor = hpRatio > 0.5 ? 0x44cc44 : hpRatio > 0.25 ? 0xddaa00 : 0xdd2222;
      const hpFill = this.scene.add.rectangle(
        x + Math.round(1.5 * LAYOUT_SCALE) + fillW / 2,
        y + CARD_H - hpBgH / 2,
        fillW, hpBgH,
        fillColor, alpha
      );
      this.add(hpFill);
    }
  }

  private buildNextRound(units: Map<string, Unit>): Unit[] {
    return Array.from(units.values())
      .filter(u => u.hp > 0)
      .sort((a, b) => {
        const ia = effectiveStats(a).initiative;
        const ib = effectiveStats(b).initiative;
        if (ib !== ia) return ib - ia;
        // same initiative: player first
        if (a.anchor.side !== b.anchor.side) return a.anchor.side === 'player' ? -1 : 1;
        return 0;
      });
  }
}
