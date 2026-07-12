import Phaser from 'phaser';
import { PhaseManager } from '../core/PhaseManager';
import { EventBus, Events } from '../core/EventBus';
import type { UpgradeTreePhase } from '../core/phases';
import { UpgradeTreePanel } from '../objects/panels/UpgradeTreePanel';

export class UpgradeTreeScreen extends Phaser.Scene {
  private panel: UpgradeTreePanel | null = null;

  constructor() { super({ key: 'UpgradeTreeScreen' }); }

  create(): void {
    const phase = PhaseManager.getPhase() as UpgradeTreePhase;
    if (phase.type !== 'upgrade_tree') return;

    const { width: w, height: h } = this.scale;

    this.panel = new UpgradeTreePanel({
      scene:   this,
      w,
      h,
      phase,
      onBack:  () => PhaseManager.transition({ type: 'close_upgrade_tree' }),
      onChooseUpgrade: (tierId, upgradeId) =>
        PhaseManager.transition({ type: 'choose_upgrade', tierId, upgradeId }),
    });

    EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  shutdown(): void {
    EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  private onStateChanged(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'upgrade_tree') return;
    this.panel?.refresh(phase);
  }
}
