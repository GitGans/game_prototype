import Phaser from 'phaser';
import { BaseTooltip } from '../ui/BaseTooltip';
import { SkillIconSnapshot } from '../core/phases';
import { fontSize, VALUE_COLOR, TOOLTIP } from '../ui/theme';

const PAD  = TOOLTIP.pad;
const LINE = TOOLTIP.lineH;

export class SkillCellTooltip extends BaseTooltip<SkillIconSnapshot> {
  constructor(scene: Phaser.Scene, width: number) {
    super(scene, width, TOOLTIP.bg, TOOLTIP.bgAlpha);
  }

  protected buildContent(data: SkillIconSnapshot): number {
    const damageColor =
      data.damageType === 'physical' ? '#ff6666' :
      data.damageType === 'magical'  ? '#6699ff' :
      VALUE_COLOR.neutral;

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
      color:    VALUE_COLOR.muted,
    });
    y += LINE;

    const desc = this.addText(PAD, y, data.description, {
      fontSize: fontSize('xs'),
      color:    VALUE_COLOR.neutral,
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
      TOOLTIP.pad,
      sw - this.tooltipW - TOOLTIP.pad,
    );
    this.setPosition(tx, anchorY + TOOLTIP.pad);
    this.setVisible(true);
  }
}
