import Phaser from 'phaser';
import { fontSize } from '../ui/theme';
import { ItemSlotSnapshot } from '../battle/types';
import { ItemTooltip, ItemTooltipData } from './ItemTooltip';

const SLOT_COLORS: Record<string, number> = {
  necklace:    0x3a5a7a,
  helmet:      0x7a4a4a,
  artifact:    0x5a3a7a,
  hand_left:   0x3a6a4a,
  armor:       0x4a4a6a,
  hand_right:  0x7a5a3a,
  ring_1:      0x3a7a7a,
  belt:        0x6a6a3a,
  ring_2:      0x3a7a7a,
  gloves:      0x5a5a4a,
  boots:       0x4a3a5a,
  activatable: 0x7a4a3a,
  default:     0x4a4a4a,
};

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
}

export class ItemCell extends Phaser.GameObjects.Container {
  private currentItem: ItemSlotSnapshot | null;
  private readonly cfg: ItemCellConfig;
  private borderRect!: Phaser.GameObjects.Rectangle;
  private contentObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(cfg: ItemCellConfig) {
    super(cfg.scene, cfg.x, cfg.y);
    this.cfg = cfg;
    this.currentItem = cfg.item;

    // Background
    const bgRect = cfg.scene.add.rectangle(0, 0, cfg.size, cfg.size, 0x2a2a3a).setOrigin(0, 0);
    this.add(bgRect);

    // Hover border (initially invisible)
    this.borderRect = cfg.scene.add.rectangle(0, 0, cfg.size, cfg.size, 0x000000, 0).setOrigin(0, 0);
    this.borderRect.setStrokeStyle(1, 0xffffff, 0);
    this.add(this.borderRect);

    this.buildContent(cfg.item);

    this.setSize(cfg.size, cfg.size);
    this.setInteractive({ useHandCursor: !!cfg.onClick });

    this.on('pointerover', () => {
      this.borderRect.setStrokeStyle(1, 0xffffff, 1);
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

  refresh(item: ItemSlotSnapshot | null): void {
    this.currentItem = item;
    for (const obj of this.contentObjects) obj.destroy();
    this.contentObjects = [];
    this.buildContent(item);
  }

  private buildContent(item: ItemSlotSnapshot | null): void {
    const { scene, size, slotKey, slotLabel } = this.cfg;

    if (!item) {
      const label = scene.add.text(size / 2, size / 2, slotLabel, {
        fontSize: fontSize('xs'),
        color: '#555566',
      }).setOrigin(0.5);
      this.add(label);
      this.contentObjects.push(label);
      return;
    }

    const spriteKey = `sprite-item-${item.definition.id}`;
    if (scene.textures.exists(spriteKey)) {
      const img = scene.add.image(size / 2, size / 2, spriteKey)
        .setDisplaySize(size - 4, size - 4)
        .setOrigin(0.5);
      this.add(img);
      this.contentObjects.push(img);
    } else {
      const color = SLOT_COLORS[slotKey] ?? SLOT_COLORS['default'];
      const rect = scene.add.rectangle(0, 0, size, size, color).setOrigin(0, 0);
      const letter = scene.add.text(size / 2, size / 2, item.definition.name.charAt(0), {
        fontSize: fontSize('md'),
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add(rect);
      this.add(letter);
      this.contentObjects.push(rect, letter);
    }
  }

  private showTooltip(item: ItemSlotSnapshot): void {
    const def = item.definition;
    const stats: ItemTooltipData['stats'] = [];
    if (def.battleStatBonuses.hp              !== 0) stats.push({ label: 'HP',         value: def.battleStatBonuses.hp              });
    if (def.battleStatBonuses.physicalDamage   !== 0) stats.push({ label: 'Phys Dmg',   value: def.battleStatBonuses.physicalDamage   });
    if (def.battleStatBonuses.magicalDamage    !== 0) stats.push({ label: 'Magic Dmg',  value: def.battleStatBonuses.magicalDamage    });
    if (def.battleStatBonuses.physicalDefense  !== 0) stats.push({ label: 'Phys Def',   value: def.battleStatBonuses.physicalDefense  });
    if (def.battleStatBonuses.magicalDefense   !== 0) stats.push({ label: 'Magic Def',  value: def.battleStatBonuses.magicalDefense   });

    const data: ItemTooltipData = {
      name: def.name,
      stats,
      classRestriction: def.allowedClasses?.length ? def.allowedClasses.join(', ') : null,
      classAllowed: null,
    };

    const matrix = this.getWorldTransformMatrix();
    this.cfg.tooltip.show(data, matrix.tx + this.cfg.size, matrix.ty, 'right');
  }
}
