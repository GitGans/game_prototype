import Phaser from 'phaser';
import { GamePhase } from '../../core/phases';
import { UnitPortrait } from '../UnitPortrait';
import { UnitCampButton } from '../UnitCampButton';
import { Button } from '../../ui/Button';
import { scaled } from '../../ui/layout';
import { UI_THEME } from '../../ui/theme';

type EquipScreenPhase      = Extract<GamePhase, { type: 'equip_screen' }>;
type DebugEquipScreenPhase = Extract<GamePhase, { type: 'debug_equip_screen' }>;
type AnyEquipPhase         = EquipScreenPhase | DebugEquipScreenPhase;

export interface UnitSelectionPanelConfig {
  scene:        Phaser.Scene;
  screenW:      number;
  screenH:      number;
  phase:        AnyEquipPhase;
  onSelectUnit: (templateId: string) => void;
  onToggleCamp?: (templateId: string) => void;
  onGoToBattle?: () => void;
  onBack?:      () => void;
}

const PORTRAIT_SEL = scaled(128);
const PAD          = scaled(16);

export class UnitSelectionPanel extends Phaser.GameObjects.Container {
  constructor(cfg: UnitSelectionPanelConfig) {
    super(cfg.scene, 0, 0);

    const { scene, screenW, screenH, phase, onSelectUnit, onToggleCamp, onGoToBattle, onBack } = cfg;
    const isDebug = phase.type === 'debug_equip_screen';
    const units   = phase.availableUnits;

    this.add(
      scene.add.text(screenW / 2, scaled(40),
        isDebug ? 'Debug — Select character' : 'Select a character', {
          fontSize:  `${scaled(18)}px`,
          color:     UI_THEME.color.value.neutral,
          fontStyle: 'bold',
        }).setOrigin(0.5),
    );

    const rows   = [units.slice(0, 6), units.slice(6, 12)].filter(r => r.length > 0);
    const startY = scaled(100);

    rows.forEach((row, ri) => {
      const rowY   = startY + ri * (PORTRAIT_SEL + scaled(28));
      const totalW = row.length * (PORTRAIT_SEL + PAD) - PAD;
      const rowX   = (screenW - totalW) / 2;

      row.forEach((u, i) => {
        const px = rowX + i * (PORTRAIT_SEL + PAD);

        const portrait = new UnitPortrait({
          scene,
          x:         px,
          y:         rowY,
          size:      PORTRAIT_SEL,
          spriteKey: u.spriteKey,
          name:      u.name,
          showLabel: true,
          onClick:   () => onSelectUnit(u.templateId),
        });
        this.add(portrait);

        if (isDebug && onToggleCamp) {
          const campIds = (phase as DebugEquipScreenPhase).campUnitIds;
          const btn = new UnitCampButton(
            scene,
            px + PORTRAIT_SEL / 2,
            rowY + PORTRAIT_SEL - scaled(11),
            campIds.includes(u.templateId),
            () => onToggleCamp(u.templateId),
          );
          this.add(btn);
        }
      });
    });

    if (isDebug && onGoToBattle) {
      this._addGoToBattleButton(scene, screenW, screenH, phase as DebugEquipScreenPhase, onGoToBattle);
    } else if (onBack) {
      this._addBackButton(scene, screenW, screenH, onBack);
    }

    scene.add.existing(this);
  }

  private _addGoToBattleButton(
    scene:        Phaser.Scene,
    w:            number,
    h:            number,
    phase:        DebugEquipScreenPhase,
    onGoToBattle: () => void,
  ): void {
    const valid = phase.canStartBattle;
    this.add(new Button({
      scene,
      x:       w / 2,
      y:       h - scaled(36),
      w:       scaled(160),
      h:       scaled(44),
      label:   'Go to Battle →',
      style:   valid ? 'primary' : 'danger',
      onClick: valid ? onGoToBattle : () => {},
    }));
  }

  private _addBackButton(scene: Phaser.Scene, w: number, h: number, onBack: () => void): void {
    this.add(new Button({
      scene,
      x:       w - PAD - scaled(22),
      y:       h - PAD - scaled(17),
      w:       scaled(44),
      h:       scaled(34),
      label:   '←',
      style:   'neutral',
      onClick: onBack,
    }));
  }
}
