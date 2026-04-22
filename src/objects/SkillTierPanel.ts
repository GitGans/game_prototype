import Phaser from 'phaser';
import { SkillTierSnapshot } from '../core/phases';
import { fontSize, VALUE_COLOR, ALPHA } from '../ui/theme';
import { LAYOUT_SCALE } from '../core/Constants';
import { SkillCellTooltip } from './SkillCellTooltip';

const CELL      = Math.round(16 * LAYOUT_SCALE);
const GAP       = Math.round(4  * LAYOUT_SCALE);
const HEADER_H  = Math.round(20 * LAYOUT_SCALE);
const LOCK_H    = Math.round(16 * LAYOUT_SCALE);
const TOOLTIP_W = Math.round(140 * LAYOUT_SCALE);

export class SkillTierPanel extends Phaser.GameObjects.Container {
  private items:   Phaser.GameObjects.GameObject[] = [];
  private tooltip: SkillCellTooltip;
  private panelW:  number;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
    super(scene, x, y);
    this.panelW  = width;
    this.tooltip = new SkillCellTooltip(scene, TOOLTIP_W);
    scene.add.existing(this);
  }

  render(
    tiers: SkillTierSnapshot[],
    onChoose: (tierId: 0 | 5 | 10 | 15 | 20, skillId: string) => void,
  ): void {
    this.clear();
    let curY = 0;

    for (const tier of tiers) {
      const labelText = tier.tierId === 0 ? 'Base Skill' : `Level ${tier.tierId}`;
      const header = this.scene.add.text(0, curY, labelText, {
        fontSize:  fontSize('sm'),
        color:     tier.isLocked ? VALUE_COLOR.muted : VALUE_COLOR.neutral,
        fontStyle: 'bold',
      }).setOrigin(0, 0);
      this.add(header);
      this.items.push(header);
      curY += HEADER_H;

      if (tier.isLocked) {
        const locked = this.scene.add.text(GAP, curY, `Unlocks at level ${tier.tierId}`, {
          fontSize: fontSize('xs'),
          color:    VALUE_COLOR.inactive,
        }).setOrigin(0, 0);
        this.add(locked);
        this.items.push(locked);
        curY += LOCK_H + GAP;
        continue;
      }

      const chosen   = tier.chosenSkillId;
      const cellRowY = curY;
      tier.options.forEach((opt, i) => {
        const cellX    = i * (CELL + GAP);
        const isChosen = chosen !== null && opt.id === chosen;
        const alpha    = chosen !== null && !isChosen ? ALPHA.disabled : ALPHA.active;

        const bg = this.scene.add.rectangle(cellX, curY, CELL, CELL, 0x2a2a3a)
          .setOrigin(0, 0).setAlpha(alpha);
        this.add(bg);
        this.items.push(bg);

        const textureKey = `skill_${opt.id}`;
        if (this.scene.textures.exists(textureKey)) {
          const img = this.scene.add.image(cellX + CELL / 2, curY + CELL / 2, textureKey)
            .setDisplaySize(CELL, CELL).setAlpha(alpha);
          this.add(img);
          this.items.push(img);
        } else {
          const ph = this.scene.add.rectangle(cellX, curY, CELL, CELL, 0x666666)
            .setOrigin(0, 0).setAlpha(alpha);
          this.add(ph);
          this.items.push(ph);
        }

        const border = this.scene.add.rectangle(cellX, curY, CELL, CELL, 0x888888, 0)
          .setOrigin(0, 0).setStrokeStyle(1, isChosen ? 0xffdd44 : 0x556677);
        this.add(border);
        this.items.push(border);

        const hit = this.scene.add.rectangle(cellX, curY, CELL, CELL, 0, 0)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: chosen === null });
        this.add(hit);
        this.items.push(hit);

        if (chosen === null) {
          const tierId = tier.tierId;
          const optId  = opt.id;
          hit.on('pointerdown', () => onChoose(tierId, optId));
        }

        hit.on('pointerover', () => {
          const worldX = this.x + cellX    + CELL / 2;
          const worldY = this.y + cellRowY + CELL;
          this.tooltip.showBelow(opt, worldX, worldY);
        });
        hit.on('pointerout', () => this.tooltip.hide());
      });

      curY += CELL + GAP * 2;
    }
  }

  private clear(): void {
    this.tooltip.hide();
    for (const item of this.items) item.destroy();
    this.items = [];
  }

  destroy(fromScene?: boolean): void {
    this.clear();
    this.tooltip.destroy();
    super.destroy(fromScene);
  }
}
