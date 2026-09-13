import Phaser from 'phaser';
import type { BattleActionBarEntry } from '../shared/battleSnapshots';
import { UI_THEME } from '../ui/theme';
import { BATTLE_VISUAL_THEME } from './battleVisualTheme';
import { SkillTooltip } from './SkillTooltip';
import { buildSkillIconSnapshot } from '../core/unitUpgradePresentation';
import { formatBattleItemActionTooltip } from './itemUseEffectPresentation';

/**
 * The active unit's action bar. It renders whatever entries the committed snapshot supplies —
 * ordinary skills and, when one is currently offerable, the unit's equipped item — and decides
 * nothing about which of them exist or are enabled. The highlighted entry is the committed
 * selection: the item in targeting mode when there is one, otherwise the active skill.
 */
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
    entries:          readonly BattleActionBarEntry[],
    activeSkillIndex: number,
    iconX:            number,
    startY:           number,
    iconSize:         number,
    iconGap:          number,
    onSelect:         (entry: BattleActionBarEntry) => void,
    selectedItemInstanceId: string | null,
  ): void {
    this.clear();

    entries.forEach((entry, i) => {
      const iconY = startY + i * (iconSize + iconGap);
      const s = BATTLE_VISUAL_THEME.skillBar;

      // A disabled item action stays VISIBLE and dimmed: "you cannot drink this yet, and here
      // is why" is information the player needs, and the state is recoverable.
      const disabled = entry.kind === 'item' && !entry.enabled;
      const isActive = entry.kind === 'item'
        ? entry.instanceId === selectedItemInstanceId
        : selectedItemInstanceId === null && entry.skillIndex === activeSkillIndex;

      const baseColor   = isActive ? s.activeBase   : UI_THEME.component.button.dark.base;
      const hoverColor  = isActive ? s.activeHover  : UI_THEME.component.button.dark.hover;
      const strokeColor = isActive ? s.activeStroke : s.inactiveStroke;

      const bg = this.scene.add.rectangle(0, 0, iconSize, iconSize, baseColor)
        .setStrokeStyle(2, strokeColor);

      const tooltipData = entry.kind === 'skill'
        ? { name: entry.skill.name, colorKind: buildSkillIconSnapshot(entry.skill).colorKind }
        : {
            name: formatBattleItemActionTooltip(entry.label, entry.effect, entry.disabledReason),
            colorKind: 'neutral' as const,
          };

      const icon = this.scene.add.container(iconX, iconY, [bg])
        .setSize(iconSize, iconSize)
        .setInteractive({ useHandCursor: !disabled })
        .setDepth(10)
        .setAlpha(disabled ? UI_THEME.alpha.disabled : UI_THEME.alpha.active)
        .on('pointerover', () => {
          if (!disabled) bg.setFillStyle(hoverColor);
          this.tooltip.show(tooltipData, iconX + iconSize / 2, iconY, 'right');
        })
        .on('pointerout', () => {
          bg.setFillStyle(baseColor);
          this.tooltip.hide();
        })
        .on('pointerup', () => {
          if (disabled) return;
          onSelect(entry);
        });

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
