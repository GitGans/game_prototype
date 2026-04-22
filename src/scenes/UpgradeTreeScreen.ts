import Phaser from 'phaser';
import { LAYOUT_SCALE } from '../core/Constants';
import { PhaseManager } from '../core/PhaseManager';
import { EventBus, Events } from '../core/EventBus';
import { Button } from '../ui/Button';
import { fontSize, VALUE_COLOR, SCENE_BG } from '../ui/theme';
import { UpgradeCard, UpgradeCardStatus } from '../objects/UpgradeCard';
import { UpgradeTierSnapshot } from '../core/phases';

type UpgradeTreePhase = Extract<ReturnType<typeof PhaseManager.getPhase>, { type: 'upgrade_tree' }>;

const PAD      = Math.round(16 * LAYOUT_SCALE);
const CARD_GAP = Math.round(12 * LAYOUT_SCALE);
const HEADER_H = Math.round(24 * LAYOUT_SCALE);
const BTN_W    = Math.round(100 * LAYOUT_SCALE);
const BTN_H    = Math.round(32  * LAYOUT_SCALE);

const NUM_TIERS   = 4;
const NUM_OPTIONS = 4;

export class UpgradeTreeScreen extends Phaser.Scene {
  private tierContainer: Phaser.GameObjects.Container | null = null;

  constructor() {
    super({ key: 'UpgradeTreeScreen' });
  }

  create(): void {
    const phase = PhaseManager.getPhase() as UpgradeTreePhase;
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(w / 2, h / 2, w, h, SCENE_BG.default);

    this.add.text(PAD, PAD, `${phase.unitName} — Upgrades`, {
      fontSize: fontSize('lg'),
      color: VALUE_COLOR.neutral,
      fontStyle: 'bold',
    }).setOrigin(0, 0);

    new Button({
      scene: this,
      x: w - PAD - BTN_W / 2,
      y: PAD + BTN_H / 2,
      w: BTN_W,
      h: BTN_H,
      label: '← Back',
      style: 'neutral',
      onClick: () => PhaseManager.transition({ type: 'close_upgrade_tree' }),
    });

    this.renderTiers(phase);

    EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  shutdown(): void {
    EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  private renderTiers(phase: UpgradeTreePhase): void {
    this.tierContainer?.destroy();
    const container = this.add.container(0, 0);
    this.tierContainer = container;

    const w = this.scale.width;
    const h = this.scale.height;

    const startY  = PAD + BTN_H + PAD;
    const availW  = w - 2 * PAD;
    const cardW   = Math.round((availW - (NUM_TIERS - 1) * CARD_GAP) / NUM_TIERS);
    const availH  = h - startY - PAD;
    const cardH   = Math.round((availH - HEADER_H - (NUM_OPTIONS - 1) * CARD_GAP) / NUM_OPTIONS);

    phase.upgradeTiers.forEach((tier, col) => {
      const tierX = PAD + col * (cardW + CARD_GAP);

      const label = tier.isLocked ? `Lvl ${tier.tierId}  (locked)` : `Lvl ${tier.tierId}`;
      const header = this.add.text(tierX, startY, label, {
        fontSize: fontSize('sm'),
        color: tier.isLocked ? VALUE_COLOR.inactive : VALUE_COLOR.highlight,
        fontStyle: 'bold',
      }).setOrigin(0, 0);
      container.add(header);

      tier.options.forEach((opt, row) => {
        const cardY = startY + HEADER_H + row * (cardH + CARD_GAP);
        const status = cardStatus(tier, opt.id);
        const card = new UpgradeCard(
          this, tierX, cardY, opt, status,
          () => PhaseManager.transition({
            type: 'choose_upgrade',
            templateId: phase.unitTemplateId,
            tierId: tier.tierId,
            upgradeId: opt.id,
          }),
          cardW,
          cardH,
        );
        container.add(card);
      });
    });
  }

  private onStateChanged(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'upgrade_tree') return;
    this.renderTiers(phase);
  }
}

function cardStatus(tier: UpgradeTierSnapshot, optionId: string): UpgradeCardStatus {
  if (tier.isLocked) return 'locked';
  if (tier.chosenUpgradeId === optionId) return 'chosen';
  if (tier.chosenUpgradeId !== null) return 'locked';
  return 'available';
}
