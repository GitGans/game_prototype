import Phaser from 'phaser';
import { scaled } from '../../ui/layout';
import { Panel } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { UI_THEME } from '../../ui/theme';
import type { PartyPanelData, PrepUnitPanelItem } from './types';

export type { PartyPanelData };

export interface PartyPanelCallbacks {
  onClose:     () => void;
  onEquipUnit: (templateId: string) => void;
}

export interface PartyPanelConfig {
  scene:     Phaser.Scene;
  x:         number;
  y:         number;
  data:      PartyPanelData;
  callbacks: PartyPanelCallbacks;
}

const W     = scaled(500);
const H     = scaled(420);
const ROW_W = scaled(420);
const ROW_H = scaled(38);

export class PartyPanel extends Phaser.GameObjects.Container {
  constructor(cfg: PartyPanelConfig) {
    super(cfg.scene, cfg.x, cfg.y);
    this.setDepth(UI_THEME.depth.panel);

    this.add(new Panel({ scene: cfg.scene, x: 0, y: 0, width: W, height: H }));

    this.add(
      cfg.scene.add
        .text(0, -scaled(180), 'Party', {
          fontSize:  `${scaled(22)}px`,
          color:     UI_THEME.color.value.highlight,
          fontStyle: 'bold',
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

    const startY = -scaled(140);
    cfg.data.units.forEach((unit: PrepUnitPanelItem, i: number) => {
      this._addUnitRow(cfg, unit, startY + i * ROW_H);
    });

    cfg.scene.add.existing(this);
  }

  private _addUnitRow(
    cfg:  PartyPanelConfig,
    unit: PrepUnitPanelItem,
    y:    number,
  ): void {
    const status = unit.inCamp ? ' [Camp]' : '';

    const row = cfg.scene.add
      .rectangle(0, y + scaled(10), ROW_W, scaled(32), UI_THEME.component.button.ghost.base)
      .setInteractive({ useHandCursor: true });

    row.on('pointerover', () => row.setFillStyle(UI_THEME.component.button.ghost.hover));
    row.on('pointerout',  () => row.setFillStyle(UI_THEME.component.button.ghost.base));
    row.on('pointerup',   () => cfg.callbacks.onEquipUnit(unit.templateId));

    this.add(row);
    this.add(
      cfg.scene.add.text(
        -scaled(190), y,
        `${unit.name}  Lv.${unit.level}${status}`,
        { fontSize: `${scaled(15)}px`, color: UI_THEME.color.value.white },
      ),
    );
  }
}
