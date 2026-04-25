import Phaser from 'phaser';
import { PhaseManager } from '../core/PhaseManager';
import { Button } from '../ui/Button';
import { LAYOUT_SCALE } from '../core/Constants';
import { VALUE_COLOR, SCENE_BG } from '../ui/theme';

const S = LAYOUT_SCALE;

export class MapVictory extends Phaser.Scene {
  constructor() { super('MapVictory'); }

  create(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'map_victory') return;

    const { width: w, height: h } = this.scale;

    this.add.rectangle(w / 2, h / 2, w, h, SCENE_BG.victory);

    this.add.text(w / 2, Math.round(h * 0.3), 'MAP CLEARED', {
      fontSize:        `${Math.round(64 * S)}px`,
      color:           VALUE_COLOR.highlight,
      fontStyle:       'bold',
      stroke:          '#000000',
      strokeThickness: Math.round(5 * S),
    }).setOrigin(0.5);

    this.add.text(w / 2, Math.round(h * 0.42), `All enemies on map "${phase.mapId}" defeated`, {
      fontSize: `${Math.round(22 * S)}px`,
      color:    '#cccccc',
    }).setOrigin(0.5);

    new Button({
      scene:   this,
      x:       w / 2,
      y:       Math.round(h * 0.6),
      w:       Math.round(220 * S),
      h:       Math.round(52 * S),
      label:   'Return to Menu',
      style:   'navy',
      onClick: () => PhaseManager.transition({ type: 'exit_to_menu' }),
    });
  }
}
