import Phaser from 'phaser';
import { fontSize } from '../ui/theme';
import { ITEM_VISUAL_THEME } from './itemVisualTheme';
import { ItemSlotSnapshot } from '../shared/snapshotTypes';
import { ItemTooltip, ItemTooltipData } from './ItemTooltip';
import { ItemIconView } from './ItemIconView';
import { UNIT_BATTLE_STAT_KEYS, STAT_PRESENTATION, formatStatValue } from './statPresentation';
import type { ItemUsability } from '../shared/snapshotTypes';
import { formatUseEffectLine, formatItemBlockedReason } from './itemUseEffectPresentation';

export interface ItemCellConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
  size: number;
  slotKey: string;
  slotLabel: string;
  item: ItemSlotSnapshot | null;
  tooltip: ItemTooltip;
  onClick?: (item: ItemSlotSnapshot | null) => void;
  /**
   * Consumable eligibility for the currently selected character, supplied by the owner.
   * Travels the existing item-data path — this component never reads phase or session state.
   */
  usage?: ItemUsability | null;
}

export class ItemCell extends Phaser.GameObjects.Container {
  private currentItem: ItemSlotSnapshot | null;
  private currentUsage: ItemUsability | null;
  private readonly cfg: ItemCellConfig;
  private borderRect!: Phaser.GameObjects.Rectangle;
  private contentObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(cfg: ItemCellConfig) {
    super(cfg.scene, cfg.x + cfg.size / 2, cfg.y + cfg.size / 2);
    this.cfg = cfg;
    this.currentItem = cfg.item;
    this.currentUsage = cfg.usage ?? null;

    // Background
    const bgRect = cfg.scene.add.rectangle(-cfg.size / 2, -cfg.size / 2, cfg.size, cfg.size, ITEM_VISUAL_THEME.cell.bg).setOrigin(0, 0);
    this.add(bgRect);

    // Hover border (initially invisible)
    this.borderRect = cfg.scene.add.rectangle(-cfg.size / 2, -cfg.size / 2, cfg.size, cfg.size, 0x000000, 0).setOrigin(0, 0);
    this.borderRect.setStrokeStyle(1, ITEM_VISUAL_THEME.cell.hoverBorder, 0);
    this.add(this.borderRect);

    this.buildContent(cfg.item);

    this.setSize(cfg.size, cfg.size);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, cfg.size, cfg.size),
      Phaser.Geom.Rectangle.Contains,
    );
    if (cfg.onClick) this.input!.cursor = 'pointer';

    this.on('pointerover', () => {
      this.borderRect.setStrokeStyle(1, ITEM_VISUAL_THEME.cell.hoverBorder, 1);
      if (this.currentItem) this.showTooltip(this.currentItem);
    });
    this.on('pointerout', () => {
      this.borderRect.setStrokeStyle(1, 0xffffff, 0);
      cfg.tooltip.hide();
    });
    if (cfg.onClick) {
      this.on('pointerup', () => cfg.onClick!(this.currentItem));
    }

    cfg.scene.add.existing(this);
  }

  refresh(item: ItemSlotSnapshot | null, usage: ItemUsability | null = null): void {
    this.currentItem = item;
    this.currentUsage = usage;
    for (const obj of this.contentObjects) obj.destroy();
    this.contentObjects = [];
    this.buildContent(item);
  }

  private buildContent(item: ItemSlotSnapshot | null): void {
    const { scene, size, slotLabel } = this.cfg;

    if (!item) {
      const label = scene.add.text(0, 0, slotLabel, {
        fontSize: fontSize('xs'),
        color: ITEM_VISUAL_THEME.cell.emptySlot,
      }).setOrigin(0.5);
      this.add(label);
      this.contentObjects.push(label);
      return;
    }

    const icon = new ItemIconView(scene, -size / 2, -size / 2, size, item);
    this.add(icon);
    this.contentObjects.push(icon);
  }

  private showTooltip(item: ItemSlotSnapshot): void {
    const def = item.definition;
    const stats: ItemTooltipData['stats'] = UNIT_BATTLE_STAT_KEYS
      .filter((key) => def.battleStatBonuses[key] !== 0)
      .map((key) => ({
        label:   STAT_PRESENTATION[key].label,
        value:   def.battleStatBonuses[key],
        display: formatStatValue(key, Math.abs(def.battleStatBonuses[key])),
      }));

    // Effect and blocked-reason lines, composed here from the supplied usage — the tooltip
    // renders what it is given. The blocked reason is unconditional: a player must always be
    // told why a consumable cannot be used (e.g. the character is dead).
    const notes: ItemTooltipData['notes'] = [];
    if (item.metadata.kind === 'consumable') {
      const effectLine = formatUseEffectLine(def.useEffect);
      if (effectLine) notes.push({ text: effectLine, tone: 'positive' });
      if (this.currentUsage && !this.currentUsage.canUse) {
        notes.push({
          text: formatItemBlockedReason(this.currentUsage.reason),
          tone: 'negative',
        });
      }
    }

    const data: ItemTooltipData = {
      name: def.name,
      stats,
      classRestriction: def.allowedClassIds?.length ? def.allowedClassIds.join(', ') : null,
      classAllowed: null,
      notes,
    };

    const matrix = this.getWorldTransformMatrix();
    this.cfg.tooltip.show(data, matrix.tx + this.cfg.size / 2, matrix.ty - this.cfg.size / 2, 'right');
  }
}
