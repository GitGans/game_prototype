import Phaser from 'phaser';
import { LAYOUT_SCALE } from '../core/Constants';
import { PhaseManager } from '../core/PhaseManager';
import { Button } from '../ui/Button';
import { NumberInput } from '../ui/NumberInput';
import { fontSize, VALUE_COLOR, SCENE_BG } from '../ui/theme';

export class DebugLevelSelect extends Phaser.Scene {
  constructor() {
    super('DebugLevelSelect');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const cy = h / 2;

    this.add.rectangle(cx, cy, w, h, SCENE_BG.default);

    this.add.text(cx, Math.round(80 * LAYOUT_SCALE), 'Debug Battle', {
      fontSize: fontSize('xl'),
      color: VALUE_COLOR.highlight,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, cy - Math.round(70 * LAYOUT_SCALE), 'Player unit level (1 – 30)', {
      fontSize: fontSize('md'),
      color: VALUE_COLOR.neutral,
    }).setOrigin(0.5);

    let selectedLevel: number | null = 1;

    const startBtn = new Button({
      scene: this,
      x: cx,
      y: cy + Math.round(70 * LAYOUT_SCALE),
      w: Math.round(160 * LAYOUT_SCALE),
      h: Math.round(52 * LAYOUT_SCALE),
      label: 'Start',
      style: 'primary',
      onClick: () => PhaseManager.transition({ type: 'init_debug', level: selectedLevel! }),
    });

    new NumberInput({
      scene: this,
      x: cx,
      y: cy,
      min: 1,
      max: 30,
      initial: 1,
      onChange: v => {
        selectedLevel = v;
        startBtn.setDisabled(v === null);
      },
    });

    new Button({
      scene: this,
      x: cx,
      y: cy + Math.round(140 * LAYOUT_SCALE),
      w: Math.round(160 * LAYOUT_SCALE),
      h: Math.round(40 * LAYOUT_SCALE),
      label: '← Back',
      style: 'neutral',
      onClick: () => PhaseManager.transition({ type: 'exit_to_menu' }),
    });
  }
}
