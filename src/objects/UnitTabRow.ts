import Phaser from 'phaser';
import { UnitPortrait } from './UnitPortrait';
import { UnitTabSnapshot } from '../shared/snapshotTypes';

export interface UnitTabRowConfig {
  scene:              Phaser.Scene;
  screenW:            number;
  y:                  number;
  cellSize:           number;
  gap:                number;
  units:              UnitTabSnapshot[];
  selectedTemplateId: string;
  onSwitch:           (templateId: string) => void;
}

export class UnitTabRow {
  private portraits: UnitPortrait[] = [];

  constructor(cfg: UnitTabRowConfig) {
    const { scene, screenW, y, cellSize, gap, units, selectedTemplateId, onSwitch } = cfg;
    const totalW = units.length * (cellSize + gap) - gap;
    const startX = Math.round((screenW - totalW) / 2);

    units.forEach((u, i) => {
      const isSelected = u.templateId === selectedTemplateId;
      const portrait = new UnitPortrait({
        scene,
        x:         startX + i * (cellSize + gap),
        y,
        size:      cellSize,
        spriteKey: u.spriteKey,
        name:      u.name,
        dimmed:    !isSelected,
        onClick:   isSelected ? undefined : () => onSwitch(u.templateId),
      });
      scene.add.existing(portrait);
      this.portraits.push(portrait);
    });
  }

  destroy(): void {
    this.portraits.forEach(p => p.destroy());
    this.portraits = [];
  }
}
