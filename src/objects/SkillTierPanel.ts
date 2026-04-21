import Phaser from 'phaser';
import { SkillTierSnapshot } from '../core/phases';
import { Button } from '../ui/Button';
import { fontSize, VALUE_COLOR, TOOLTIP } from '../ui/theme';
import { LAYOUT_SCALE } from '../core/Constants';

const ROW_H     = Math.round(28 * LAYOUT_SCALE);
const HEADER_H  = Math.round(20 * LAYOUT_SCALE);
const GAP       = Math.round(4  * LAYOUT_SCALE);
const BTN_H     = Math.round(24 * LAYOUT_SCALE);

export class SkillTierPanel extends Phaser.GameObjects.Container {
  private items: Phaser.GameObjects.GameObject[] = [];
  private panelW: number;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number) {
    super(scene, x, y);
    this.panelW = width;
    scene.add.existing(this);
  }

  render(
    tiers: SkillTierSnapshot[],
    onChoose: (tierId: 0 | 5 | 10 | 15 | 20, skillId: string) => void,
  ): void {
    this.clear();

    let curY = 0;
    const scene = this.scene;
    const w = this.panelW;

    for (const tier of tiers) {
      // ── Header ──────────────────────────────────────────────────
      const labelText = tier.tierId === 0 ? 'Base Skill' : `Level ${tier.tierId}`;
      const header = scene.add.text(0, curY, labelText, {
        fontSize: fontSize('sm'),
        color: tier.isLocked ? VALUE_COLOR.muted : VALUE_COLOR.neutral,
        fontStyle: 'bold',
      }).setOrigin(0, 0);
      this.add(header);
      this.items.push(header);
      curY += HEADER_H;

      if (tier.isLocked) {
        // Grayed placeholder
        const locked = scene.add.text(GAP, curY, `Unlocks at level ${tier.tierId}`, {
          fontSize: fontSize('xs'),
          color: VALUE_COLOR.inactive,
        }).setOrigin(0, 0);
        this.add(locked);
        this.items.push(locked);
        curY += ROW_H + GAP;
        continue;
      }

      if (tier.chosenSkillId !== null) {
        // Show chosen skill as locked label
        const chosenSkill = tier.options.find(o => o.id === tier.chosenSkillId);
        const label = chosenSkill
          ? `✓ ${chosenSkill.name} — ${chosenSkill.description}`
          : `✓ ${tier.chosenSkillId}`;
        const chosen = scene.add.text(GAP, curY, label, {
          fontSize: fontSize('xs'),
          color: VALUE_COLOR.positive,
          wordWrap: { width: w - GAP * 2 },
        }).setOrigin(0, 0);
        this.add(chosen);
        this.items.push(chosen);
        curY += ROW_H + GAP;
        continue;
      }

      // ── Option buttons ───────────────────────────────────────────
      const btnW = Math.floor((w - GAP * (tier.options.length + 1)) / tier.options.length);
      tier.options.forEach((opt, i) => {
        const btnX = GAP + i * (btnW + GAP) + btnW / 2;
        const tierId = tier.tierId;
        const optId = opt.id;
        const btn = new Button({
          scene,
          x: btnX,
          y: curY + BTN_H / 2,
          w: btnW,
          h: BTN_H,
          label: opt.name,
          style: 'ghost',
          fontKey: 'xs',
          onClick: () => onChoose(tierId, optId),
        });
        scene.add.existing(btn);
        this.add(btn);
        this.items.push(btn);

        // Hover tooltip with description
        btn.setInteractive();
        let tooltip: Phaser.GameObjects.Text | null = null;
        btn.on('pointerover', () => {
          tooltip = scene.add.text(btnX, curY - TOOLTIP.pad, opt.description, {
            fontSize: fontSize('xs'),
            color: VALUE_COLOR.neutral,
            backgroundColor: '#0d1520',
            padding: { x: 4, y: 2 },
            wordWrap: { width: w },
          }).setOrigin(0.5, 1).setDepth(TOOLTIP.depth);
          this.add(tooltip!);
          this.items.push(tooltip!);
        });
        btn.on('pointerout', () => {
          if (tooltip) {
            tooltip.destroy();
            tooltip = null;
          }
        });
      });
      curY += BTN_H + GAP * 2;
    }
  }

  private clear(): void {
    for (const item of this.items) {
      item.destroy();
    }
    this.items = [];
  }

  destroy(fromScene?: boolean): void {
    this.clear();
    super.destroy(fromScene);
  }
}
