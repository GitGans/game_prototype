import Phaser from 'phaser';
import { scaled } from '../../ui/layout';
import { Panel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { UI_THEME } from '../../ui/theme';
import type { CampPanelData, PrepUnitPanelItem } from './types';

export type { CampPanelData };

export interface CampPanelCallbacks {
  onClose:      () => void;
  onToggleUnit: (templateId: string) => void;
}

export interface CampPanelConfig {
  scene:     Phaser.Scene;
  x:         number;
  y:         number;
  data:      CampPanelData;
  callbacks: CampPanelCallbacks;
}

const W     = scaled(500);
const H     = scaled(400);
const ROW_H = scaled(40);

export class CampPanel extends Phaser.GameObjects.Container {
  constructor(cfg: CampPanelConfig) {
    super(cfg.scene, cfg.x, cfg.y);
    this.setDepth(UI_THEME.depth.panel);

    this.add(new Panel({ scene: cfg.scene, x: 0, y: 0, width: W, height: H }));

    this.add(
      cfg.scene.add
        .text(0, -scaled(170), 'Camp', {
          fontSize:  `${scaled(22)}px`,
          color:     UI_THEME.color.value.highlight,
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    this.add(
      cfg.scene.add
        .text(0, -scaled(140), "Units in camp don't join battle", {
          fontSize: `${scaled(13)}px`,
          color:    UI_THEME.color.value.muted,
        })
        .setOrigin(0.5),
    );

    this.add(
      new Button({
        scene:   cfg.scene,
        x:       scaled(220),
        y:       -scaled(185),
        w:       scaled(36),
        h:       scaled(36),
        label:   '✕',
        style:   'danger',
        onClick: cfg.callbacks.onClose,
      }),
    );

    const startY = -scaled(100);
    cfg.data.units.forEach((unit: PrepUnitPanelItem, i: number) => {
      this._addUnitRow(cfg, unit, startY + i * ROW_H);
    });

    cfg.scene.add.existing(this);
  }

  private _addUnitRow(
    cfg:  CampPanelConfig,
    unit: PrepUnitPanelItem,
    y:    number,
  ): void {
    this.add(
      cfg.scene.add.text(
        -scaled(180), y,
        `${unit.name}  Lv.${unit.level}`,
        { fontSize: `${scaled(15)}px`, color: UI_THEME.color.value.white },
      ),
    );

    this.add(new Button({
      scene:   cfg.scene,
      x:       scaled(150),
      y:       y + scaled(8),
      w:       scaled(100),
      h:       scaled(28),
      label:   unit.inCamp ? 'In Camp' : 'Active',
      style:   unit.inCamp ? 'danger' : 'primary',
      onClick: () => cfg.callbacks.onToggleUnit(unit.templateId),
    }));
  }
}
