import Phaser from 'phaser';
import { BaseTooltip } from '../ui/BaseTooltip';
import { SkillIconSnapshot } from '../core/phases';
import { UI_THEME, fontSize } from '../ui/theme';
import { BATTLE_VISUAL_THEME } from './battleVisualTheme';

const PAD  = UI_THEME.component.tooltip.pad;
const LINE = UI_THEME.component.tooltip.lineH;

export class SkillCellTooltip extends BaseTooltip<SkillIconSnapshot> {
  constructor(scene: Phaser.Scene, width: number) {
    super(scene, width, UI_THEME.component.tooltip.bg, UI_THEME.component.tooltip.bgAlpha);
  }

  protected buildContent(data: SkillIconSnapshot): number {
    const damageColor =
      data.damageType === 'physical' ? BATTLE_VISUAL_THEME.skillCellTooltip.physical :
      data.damageType === 'magical'  ? BATTLE_VISUAL_THEME.skillCellTooltip.magical :
      UI_THEME.color.value.neutral;

    let y = PAD;

    this.addText(PAD, y, data.name, {
      fontSize:  fontSize('sm'),
      color:     damageColor,
      fontStyle: 'bold',
    });
    y += LINE;

    const tag = `${data.actionType}${data.damageType ? ' · ' + data.damageType : ''}`;
    this.addText(PAD, y, tag, {
      fontSize: fontSize('xs'),
      color:    UI_THEME.color.value.muted,
    });
    y += LINE;

    const desc = this.addText(PAD, y, data.description, {
      fontSize: fontSize('xs'),
      color:    UI_THEME.color.value.neutral,
      wordWrap: { width: this.tooltipW - PAD * 2 },
    });
    y += desc.height + PAD;

    return y;
  }

  showBelow(data: SkillIconSnapshot, anchorX: number, anchorY: number): void {
    this.clearContent();
    const h = this.buildContent(data);
    this.bg.setSize(this.tooltipW, h);
    const { width: sw } = this.scene.scale;
    const tx = Phaser.Math.Clamp(
      anchorX - this.tooltipW / 2,
      PAD,
      sw - this.tooltipW - PAD,
    );
    this.setPosition(tx, anchorY + PAD);
    this.setVisible(true);
  }
}
