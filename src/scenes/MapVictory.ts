import Phaser from 'phaser';
import { PhaseManager } from '../core/PhaseManager';
import { MapVictoryPanel } from '../objects/panels/MapVictoryPanel';

export class MapVictory extends Phaser.Scene {
  constructor() { super('MapVictory'); }

  create(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'map_victory') return;

    const { width: w, height: h } = this.scale;

    new MapVictoryPanel({
      scene:      this,
      w,
      h,
      mapId:      phase.mapId,
      onContinue: () => PhaseManager.transition({ type: 'exit_to_menu' }),
    });
  }
}
