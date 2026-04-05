import Phaser from 'phaser';
import { BattleState, Unit } from '../battle/types';
import { COLORS, LAYOUT_SCALE } from '../core/Constants';

const CARD_W      = Math.round(54 * LAYOUT_SCALE);
const CARD_H      = Math.round(54 * LAYOUT_SCALE);
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

    // Next round: all alive units sorted by initiative (rebuild preview)
    const nextRound = this.buildNextRound(units);

    const canvasW = this.scene.scale.width;
    const totalWidth =
      roundQueue.length * (CARD_W + CARD_GAP) - CARD_GAP +
      DIVIDER_GAP * 2 + 2 + // divider line width
      nextRound.length * (CARD_W + CARD_GAP) - (nextRound.length > 0 ? CARD_GAP : 0);

    let curX = (canvasW - totalWidth) / 2;

    // Current round cards
    for (let i = 0; i < roundQueue.length; i++) {
      const unit = units.get(roundQueue[i]);
      if (!unit) continue;
      const isActive = i === 0;
      const cardY = isActive ? -ACTIVE_LIFT : 0;
      this.drawCard(curX, cardY, unit, isActive, 1.0);
      curX += CARD_W + CARD_GAP;
    }

    // Divider line
    const divX = curX - CARD_GAP + DIVIDER_GAP;
    const divider = this.scene.add.rectangle(divX, -Math.round(4 * LAYOUT_SCALE), Math.round(2 * LAYOUT_SCALE), CARD_H + Math.round(8 * LAYOUT_SCALE), 0x8899bb);
    this.add(divider);
    curX = divX + DIVIDER_GAP;

    // Next round cards (dimmed)
    for (let i = 0; i < nextRound.length; i++) {
      const unit = nextRound[i];
      this.drawCard(curX, 0, unit, false, 0.45);
      curX += CARD_W + CARD_GAP;
    }
  }

  private drawCard(
    x: number,
    y: number,
    unit: Unit,
    isActive: boolean,
    alpha: number
  ): void {
    const isPlayer = unit.anchor.side === 'player';
    const baseColor = isPlayer ? COLORS.unitPlayer : COLORS.unitEnemy;
    const borderColor = isActive ? COLORS.cellSelected : COLORS.cellBorder;

    const border = this.scene.add.rectangle(x + CARD_W / 2, y + CARD_H / 2, CARD_W, CARD_H, borderColor, alpha);
    const bg = this.scene.add.rectangle(x + CARD_W / 2, y + CARD_H / 2, CARD_W - Math.round(3 * LAYOUT_SCALE), CARD_H - Math.round(3 * LAYOUT_SCALE), baseColor, alpha);

    const nameText = this.scene.add.text(x + CARD_W / 2, y + Math.round(10 * LAYOUT_SCALE), unit.name, {
      fontSize: `${Math.round(10 * LAYOUT_SCALE)}px`,
      color: isPlayer ? COLORS.label : COLORS.labelEnemy,
      align: 'center',
    }).setOrigin(0.5, 0).setAlpha(alpha);

    const initText = this.scene.add.text(x + CARD_W / 2, y + CARD_H - Math.round(18 * LAYOUT_SCALE), `★${unit.initiative}`, {
      fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
      color: COLORS.textLight,
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5, 0).setAlpha(alpha);

    this.add([border, bg, nameText, initText]);
  }

  private buildNextRound(units: Map<string, Unit>): Unit[] {
    const alive = Array.from(units.values())
      .filter(u => u.hp > 0)
      .sort((a, b) => {
        if (b.initiative !== a.initiative) return b.initiative - a.initiative;
        // same initiative: player first
        if (a.anchor.side !== b.anchor.side) return a.anchor.side === 'player' ? -1 : 1;
        return 0;
      });
    return alive;
  }
}
