import Phaser from 'phaser';
import { SkillIconSnapshot } from '../core/phases';
import { LAYOUT_SCALE } from '../core/Constants';
import { SkillCellTooltip } from './SkillCellTooltip';
import { BATTLE_VISUAL_THEME } from './battleVisualTheme';
import { SkillIconView } from './SkillIconView';
import { OBJECT_ICON_LAYOUT } from './iconLayout';

const CELL_SIZE     = OBJECT_ICON_LAYOUT.standardCellSize;
const CELL_GAP      = OBJECT_ICON_LAYOUT.standardCellGap;
const NAME_OFFSET_X = OBJECT_ICON_LAYOUT.standardLabelOffsetX;
const TOOLTIP_W     = OBJECT_ICON_LAYOUT.skillTooltipW;

export class SkillIconRow extends Phaser.GameObjects.Container {
  private cells: Phaser.GameObjects.GameObject[] = [];
  private tooltip: SkillCellTooltip;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.tooltip = new SkillCellTooltip(scene, TOOLTIP_W);
    scene.add.existing(this);
  }

  render(skills: SkillIconSnapshot[]): void {
    this.clearCells();
    skills.forEach((skill, i) => {
      const cy = i * (CELL_SIZE + CELL_GAP);

      const s = BATTLE_VISUAL_THEME.skillIconRow;
      const bg = this.scene.add.rectangle(0, cy, CELL_SIZE, CELL_SIZE, s.cellBg).setOrigin(0, 0);

      const icon = new SkillIconView(this.scene, 0, cy, CELL_SIZE, skill);

      const border = this.scene.add.rectangle(0, cy, CELL_SIZE, CELL_SIZE, 0, 0)
        .setOrigin(0, 0).setStrokeStyle(1, s.cellBorder);

      const label = this.scene.add.text(
        CELL_SIZE + NAME_OFFSET_X,
        cy + CELL_SIZE / 2,
        skill.name,
        { fontSize: `${Math.round(13 * LAYOUT_SCALE)}px`, color: s.labelColor },
      ).setOrigin(0, 0.5);

      const hit = this.scene.add.rectangle(0, cy, CELL_SIZE, CELL_SIZE, 0, 0)
        .setOrigin(0, 0).setInteractive();

      hit.on('pointerover', () => {
        this.tooltip.showBelow(skill, this.x + CELL_SIZE / 2, this.y + cy + CELL_SIZE);
      });
      hit.on('pointerout', () => this.tooltip.hide());

      this.add([bg, icon, border, label, hit]);
      this.cells.push(bg, icon, border, label, hit);
    });
  }

  private clearCells(): void {
    this.tooltip.hide();
    for (const c of this.cells) c.destroy();
    this.cells = [];
  }

  destroy(fromScene?: boolean): void {
    this.clearCells();
    this.tooltip.destroy();
    super.destroy(fromScene);
  }
}
