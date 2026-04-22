import Phaser from 'phaser';
import { Unit } from '../battle/types';
import { BTN } from '../ui/theme';
import { SkillTooltip } from './SkillTooltip';

export class SkillBar extends Phaser.GameObjects.Container {
  private icons: Phaser.GameObjects.Container[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly tooltip: SkillTooltip,
  ) {
    super(scene, 0, 0);
    scene.add.existing(this);
  }

  show(
    unit:     Unit,
    iconX:    number,
    startY:   number,
    iconSize: number,
    iconGap:  number,
    onSelect: (index: number) => void,
  ): void {
    this.clear();

    unit.skills.forEach((skill, i) => {
      const iconY       = startY + i * (iconSize + iconGap);
      const isActive    = i === unit.activeSkillIndex;
      const baseColor   = isActive ? 0xffcc00 : BTN.dark.base;
      const hoverColor  = isActive ? 0xffdd44 : BTN.dark.hover;
      const strokeColor = isActive ? 0xffffff : 0x888888;

      const bg = this.scene.add.rectangle(0, 0, iconSize, iconSize, baseColor)
        .setStrokeStyle(2, strokeColor);

      const icon = this.scene.add.container(iconX, iconY, [bg])
        .setSize(iconSize, iconSize)
        .setInteractive({ useHandCursor: true })
        .setDepth(10)
        .on('pointerover', () => {
          bg.setFillStyle(hoverColor);
          this.tooltip.show(
            { name: skill.name, damageType: skill.damageBlock?.damageType },
            iconX + iconSize / 2, iconY, 'right',
          );
        })
        .on('pointerout', () => {
          bg.setFillStyle(baseColor);
          this.tooltip.hide();
        })
        .on('pointerup', () => onSelect(i));

      this.icons.push(icon as Phaser.GameObjects.Container);
    });
  }

  hide(): void {
    this.clear();
  }

  private clear(): void {
    for (const icon of this.icons) icon.destroy();
    this.icons = [];
    this.tooltip.hide();
  }

  destroy(fromScene?: boolean): void {
    this.clear();
    super.destroy(fromScene);
  }
}
