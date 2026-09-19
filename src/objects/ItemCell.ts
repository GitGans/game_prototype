import Phaser from 'phaser';
import { fontSize } from '../ui/theme';
import { ITEM_VISUAL_THEME } from './itemVisualTheme';
import { ItemSlotSnapshot } from '../shared/snapshotTypes';
import { ItemTooltip, ItemTooltipData } from './ItemTooltip';
import { ItemIconView } from './ItemIconView';
import { UNIT_BATTLE_STAT_KEYS, STAT_PRESENTATION, formatStatValue } from './statPresentation';
import type { ItemUsability } from '../shared/snapshotTypes';
import {
  formatUseEffectLine, formatItemBlockedReason, formatUsableGestureHint,
} from './itemUseEffectPresentation';
import { ClickGestureRecognizer } from '../ui/clickGesture';

export interface ItemCellConfig {
  scene: Phaser.Scene;
  x: number;
  y: number;
  size: number;
  slotKey: string;
  slotLabel: string;
  item: ItemSlotSnapshot | null;
  tooltip: ItemTooltip;
  /**
   * Single click. Fires immediately, EXCEPT for a `usable` when `onDoubleClick` is also supplied —
   * then it is deferred so the two gestures stay exclusive.
   */
  onClick?: (item: ItemSlotSnapshot | null) => void;
  /**
   * Double click. Supplied only where a second click means something — out-of-combat item use. Its
   * presence is what turns on deferred recognition for `usable` items in this cell.
   */
  onDoubleClick?: (item: ItemSlotSnapshot) => void;
  /**
   * Item-use eligibility for the currently selected character, supplied by the owner.
   * Travels the existing item-data path — this component never reads phase or session state.
   */
  usage?: ItemUsability | null;
}

export class ItemCell extends Phaser.GameObjects.Container {
  private currentItem: ItemSlotSnapshot | null;
  private currentUsage: ItemUsability | null;
  private readonly cfg: ItemCellConfig;
  private readonly gesture: ClickGestureRecognizer;
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

    this.gesture = new ClickGestureRecognizer({
      schedule: (delayMs, run) => {
        const timer = cfg.scene.time.delayedCall(delayMs, run);
        return () => timer.remove(false);
      },
      // The item is re-read at FIRE time, not captured at click time, and the key is re-checked
      // against it: a cell refreshed with another instance while a click was deferred must not hand
      // the callback the replacement.
      onSingle: key => {
        if (this.currentItem?.instanceId === key) cfg.onClick?.(this.currentItem);
      },
      onDouble: key => {
        if (this.currentItem?.instanceId === key) cfg.onDoubleClick?.(this.currentItem);
      },
    });

    this.buildContent(cfg.item);

    this.setSize(cfg.size, cfg.size);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, cfg.size, cfg.size),
      Phaser.Geom.Rectangle.Contains,
    );
    if (cfg.onClick || cfg.onDoubleClick) this.input!.cursor = 'pointer';

    this.on('pointerover', () => {
      this.borderRect.setStrokeStyle(1, ITEM_VISUAL_THEME.cell.hoverBorder, 1);
      if (this.currentItem) this.showTooltip(this.currentItem);
    });
    this.on('pointerout', () => {
      this.borderRect.setStrokeStyle(1, 0xffffff, 0);
      cfg.tooltip.hide();
    });
    if (cfg.onClick || cfg.onDoubleClick) {
      this.on('pointerup', () => {
        const item = this.currentItem;
        // Only a `usable` carries two gestures. An empty slot, a consumable and ordinary gear have
        // one meaning each, so delaying them would add latency and buy nothing.
        if (item && cfg.onDoubleClick && item.metadata.kind === 'usable') {
          this.gesture.click(item.instanceId);
          return;
        }
        cfg.onClick?.(item);
      });
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

  /**
   * Drops a deferred click without emitting it.
   *
   * A pending gesture belongs to the committed snapshot under which its first click occurred, so the
   * owner calls this before rendering new committed data. Comparing instance ids instead would NOT
   * be sufficient: `reset_debug_session` keeps the same phase AND the same selected character, and
   * recreates the same authored instance ids — the same reason the item-interaction lifecycle refuses
   * to treat matching ids as proof of ownership.
   */
  cancelPendingGesture(): void {
    this.gesture.cancel();
  }

  destroy(fromScene?: boolean): void {
    this.gesture.destroy();
    super.destroy(fromScene);
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

    // Effect, affordance and blocked-reason lines, composed here from the supplied usage — the
    // tooltip renders what it is given.
    const notes: ItemTooltipData['notes'] = [];
    if (item.metadata.kind === 'consumable' || item.metadata.kind === 'usable') {
      const effectLine = formatUseEffectLine(def.useEffect);
      if (effectLine) notes.push({ text: effectLine, tone: 'positive' });
    }
    // Only a `usable` has two gestures, and with the action window gone nothing else advertises the
    // second one. The verb follows the ORIGIN the read model already decided, never the slot key.
    if (item.metadata.kind === 'usable' && this.currentUsage) {
      notes.push({ text: formatUsableGestureHint(this.currentUsage.origin), tone: 'neutral' });
    }
    // Unconditional wherever an eligibility verdict exists: a player must always be told why an item
    // cannot be used right now (dead character, already at full HP, an effect with no out-of-combat
    // support). Equipment carries no verdict and so gains no note.
    if (this.currentUsage && !this.currentUsage.canUse) {
      notes.push({
        text: formatItemBlockedReason(this.currentUsage.reason),
        tone: 'negative',
      });
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
