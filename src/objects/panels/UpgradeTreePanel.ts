import Phaser from 'phaser';
import type { UpgradeTreePhase, UpgradeTierSnapshot } from '../../core/phases';
import type { UpgradeOptionId } from '../../shared/unitTypes';
import { UpgradeCard, UpgradeCardStatus } from '../UpgradeCard';
import { Button } from '../../ui/Button';
import { scaled } from '../../ui/layout';
import { UI_THEME, fontSize } from '../../ui/theme';

const PAD         = scaled(16);
const CARD_GAP    = scaled(12);
const HEADER_H    = scaled(24);
const BTN_W       = scaled(100);
const BTN_H       = scaled(32);
const NUM_TIERS   = 4;
const NUM_OPTIONS = 4;

export interface UpgradeTreePanelConfig {
  scene:           Phaser.Scene;
  w:               number;
  h:               number;
  phase:           UpgradeTreePhase;
  onBack:          () => void;
  onChooseUpgrade: (templateId: string, tierId: 5 | 10 | 15 | 20, upgradeId: UpgradeOptionId) => void;
}

export class UpgradeTreePanel {
  private scene:           Phaser.Scene;
  private w:               number;
  private h:               number;
  private onChooseUpgrade: (templateId: string, tierId: 5 | 10 | 15 | 20, upgradeId: UpgradeOptionId) => void;
  private tierContainer:   Phaser.GameObjects.Container | null = null;

  constructor(cfg: UpgradeTreePanelConfig) {
    const { scene, w, h, phase, onBack, onChooseUpgrade } = cfg;
    this.scene           = scene;
    this.w               = w;
    this.h               = h;
    this.onChooseUpgrade = onChooseUpgrade;

    scene.add.rectangle(w / 2, h / 2, w, h, UI_THEME.color.background.default);

    scene.add.text(PAD, PAD, `${phase.unitName} — Upgrades`, {
      fontSize:  fontSize('lg'),
      color:     UI_THEME.color.value.neutral,
      fontStyle: 'bold',
    }).setOrigin(0, 0);

    new Button({
      scene,
      x:       w - PAD - BTN_W / 2,
      y:       PAD + BTN_H / 2,
      w:       BTN_W,
      h:       BTN_H,
      label:   '← Back',
      style:   'neutral',
      onClick: onBack,
    });

    this.renderTiers(phase);
  }

  refresh(phase: UpgradeTreePhase): void {
    this.tierContainer?.destroy();
    this.renderTiers(phase);
  }

  private renderTiers(phase: UpgradeTreePhase): void {
    const container = this.scene.add.container(0, 0);
    this.tierContainer = container;

    const startY = PAD + BTN_H + PAD;
    const availW = this.w - 2 * PAD;
    const cardW  = Math.round((availW - (NUM_TIERS - 1) * CARD_GAP) / NUM_TIERS);
    const availH = this.h - startY - PAD;
    const cardH  = Math.round((availH - HEADER_H - (NUM_OPTIONS - 1) * CARD_GAP) / NUM_OPTIONS);

    phase.upgradeTiers.forEach((tier, col) => {
      const tierX = PAD + col * (cardW + CARD_GAP);
      const label = tier.isLocked ? `Lvl ${tier.tierId}  (locked)` : `Lvl ${tier.tierId}`;

      const header = this.scene.add.text(tierX, startY, label, {
        fontSize:  fontSize('sm'),
        color:     tier.isLocked ? UI_THEME.color.value.inactive : UI_THEME.color.value.highlight,
        fontStyle: 'bold',
      }).setOrigin(0, 0);
      container.add(header);

      tier.options.forEach((opt, row) => {
        const cardY  = startY + HEADER_H + row * (cardH + CARD_GAP);
        const status = resolveCardStatus(tier, opt.id);

        const card = new UpgradeCard(
          this.scene, tierX, cardY, opt, status,
          () => this.onChooseUpgrade(phase.unitTemplateId, tier.tierId, opt.id),
          cardW,
          cardH,
        );
        container.add(card);
      });
    });
  }
}

function resolveCardStatus(tier: UpgradeTierSnapshot, optionId: string): UpgradeCardStatus {
  if (tier.isLocked)                     return 'locked';
  if (tier.chosenUpgradeId === optionId) return 'chosen';
  if (tier.chosenUpgradeId !== null)     return 'locked';
  return 'available';
}
