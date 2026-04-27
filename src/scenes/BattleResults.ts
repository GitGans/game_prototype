import Phaser from 'phaser';
import { PhaseManager } from '../core/PhaseManager';
import { BattleResultsPanel } from '../objects/panels/BattleResultsPanel';

export class BattleResults extends Phaser.Scene {
  constructor() { super('BattleResults'); }

  create(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'battle_results') return;

    const { width: w, height: h } = this.scale;

    new BattleResultsPanel({
      scene:      this,
      w,
      h,
      units:      phase.units,
      onContinue: () => PhaseManager.transition({ type: 'exit_results' }),
    });
  }
}
