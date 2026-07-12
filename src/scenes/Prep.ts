import Phaser from 'phaser';
import { LAYOUT_SCALE } from "../core/Constants";
import { PhaseManager } from "../core/PhaseManager";
import { EventBus, Events } from "../core/EventBus";
import { Button } from "../ui/Button";
import { UI_THEME, fontSize } from "../ui/theme";
import { scaled } from "../ui/layout";
import { EnemyGroupSelector } from "../objects/EnemyGroupSelector";
import { CampPanel } from "../objects/panels/CampPanel";
import { PartyPanel } from "../objects/panels/PartyPanel";
import { PrepActionTile } from "../objects/PrepActionTile";

export class Prep extends Phaser.Scene {
  private _activePanelKey: 'camp' | 'party' | 'shop' | null = null;
  private _campPanel:     CampPanel | null  = null;
  private _partyPanel:    PartyPanel | null = null;
  private _shopPanel:     Phaser.GameObjects.Container | null = null;
  private _enemySelector: EnemyGroupSelector | null = null;
  private _isCampMode = false;
  private battleBtn!: Button;
  private _w = 0;
  private _h = 0;

  constructor() {
    super("Prep");
  }

  create(): void {
    const phase = PhaseManager.getPhase();
    this._isCampMode = phase.type === 'camp';

    const w = this.scale.width;
    const h = this.scale.height;
    this._w = w;
    this._h = h;

    this.add.rectangle(w / 2, h / 2, w, h, UI_THEME.color.background.default);
    this.add
      .text(w / 2, Math.round(60 * LAYOUT_SCALE), "PREPARATION", {
        fontSize: fontSize('xxl'),
        color: UI_THEME.color.value.neutral,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // ── Shop stub (replaced by ShopPanel in a future stage) ───────────────────
    this._shopPanel = this.buildShopPanel(w, h);

    this.input.keyboard!.on("keydown-ESC", () => {
      if (this._activePanelKey) this._closeActivePanel();
    });

    // ── Three action tiles ────────────────────────────────────────────────────
    const iconSize = Math.round(90 * LAYOUT_SCALE);
    const iconY    = h / 2 - Math.round(60 * LAYOUT_SCALE);
    const spacing  = Math.round(160 * LAYOUT_SCALE);

    const iconDefs: Array<{
      label:    string;
      styleKey: 'camp' | 'shop' | 'party';
      key:      'camp' | 'shop' | 'party';
    }> = [
      { label: "Camp",  styleKey: 'camp',  key: 'camp'  },
      { label: "Shop",  styleKey: 'shop',  key: 'shop'  },
      { label: "Party", styleKey: 'party', key: 'party' },
    ];

    iconDefs.forEach(({ label, styleKey, key }, i) => {
      const x = w / 2 + (i - 1) * spacing;
      new PrepActionTile({
        scene: this,
        x,
        y: iconY,
        size: iconSize,
        label,
        styleKey,
        onClick: () => {
          if (key === 'camp')  { this._openCampPanel();  return; }
          if (key === 'party') { this._openPartyPanel(); return; }
          this._closeActivePanel();
          this._shopPanel!.setVisible(true);
          this._activePanelKey = 'shop';
        },
      });
    });

    // ── Go to Battle / Exit Camp button ───────────────────────────────────────
    const btnW = Math.round(220 * LAYOUT_SCALE);
    const btnH = Math.round(56 * LAYOUT_SCALE);
    const btnY = h / 2 + Math.round(160 * LAYOUT_SCALE);

    this.battleBtn = new Button({
      scene:           this,
      x:               w / 2,
      y:               btnY,
      w:               btnW,
      h:               btnH,
      label:           this._isCampMode ? 'Exit Camp' : 'Go to Battle',
      style:           'primary',
      fontKey:         'lg',
      dimWhenDisabled: false,
      onClick: () => {
        if (this._isCampMode) {
          PhaseManager.transition({ type: 'exit_camp' });
          return;
        }
        this._showEnemyGroupSelector();
      },
    });

    this.refreshBattleButton();

    EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  shutdown(): void {
    EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  // ── Panel lifecycle ─────────────────────────────────────────────────────────

  private _closeActivePanel(): void {
    this._campPanel?.destroy();  this._campPanel  = null;
    this._partyPanel?.destroy(); this._partyPanel = null;
    this._shopPanel?.setVisible(false);
    this._activePanelKey = null;
  }

  private _openCampPanel(): void {
    this._closeActivePanel();
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'camp') return;
    this._campPanel = new CampPanel({
      scene: this,
      x: this._w / 2,
      y: this._h / 2,
      data: { units: phase.units },
      callbacks: {
        onClose:      () => this._closeActivePanel(),
        onToggleUnit: (templateId) =>
          PhaseManager.transition({ type: 'toggle_camp_unit', templateId }),
      },
    });
    this._activePanelKey = 'camp';
  }

  private _openPartyPanel(): void {
    this._closeActivePanel();
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'camp') return;
    this._partyPanel = new PartyPanel({
      scene: this,
      x: this._w / 2,
      y: this._h / 2,
      data: { units: phase.units },
      callbacks: {
        onClose:     () => this._closeActivePanel(),
        onEquipUnit: (templateId) =>
          PhaseManager.transition({ type: 'open_equip_screen', unitTemplateId: templateId }),
      },
    });
    this._activePanelKey = 'party';
  }

  // ── State change handler ────────────────────────────────────────────────────

  private onStateChanged(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'camp') return;
    if (this._activePanelKey === 'camp')  this._openCampPanel();
    if (this._activePanelKey === 'party') this._openPartyPanel();
    this.refreshBattleButton();
  }

  // ── Battle button helpers ───────────────────────────────────────────────────

  private refreshBattleButton(): void {
    if (this._isCampMode) return;

    const phase = PhaseManager.getPhase();
    if (phase.type !== 'camp') return;

    const active = phase.activeLivingUnitCount;
    const valid  = phase.canStartBattle;
    const excess = active - 9;

    this.battleBtn.setStyle(valid ? 'primary' : 'danger');

    let label = "Go to Battle";
    if (active === 0) {
      label = "Go to Battle\n(party is empty)";
    } else if (excess > 0) {
      label = `Go to Battle\n(move ${excess} to camp)`;
    }
    this.battleBtn.setLabel(label);
    this.battleBtn.setDisabled(!valid);
  }

  // ── Shop Panel (legacy stub) ────────────────────────────────────────────────

  private buildShopPanel(w: number, h: number): Phaser.GameObjects.Container {
    const panel = this.add.container(0, 0).setVisible(false).setDepth(10);
    panel.add(
      this.add.rectangle(
        w / 2,
        h / 2,
        Math.round(500 * LAYOUT_SCALE),
        Math.round(400 * LAYOUT_SCALE),
        UI_THEME.color.background.panel,
      ),
    );
    panel.add(
      this.add
        .text(w / 2, h / 2 - Math.round(160 * LAYOUT_SCALE), "Shop", {
          fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
          color: UI_THEME.color.value.highlight,
          fontStyle: "bold",
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(w / 2, h / 2, "Coming soon...", {
          fontSize: `${Math.round(18 * LAYOUT_SCALE)}px`,
          color: UI_THEME.color.value.inactive,
        })
        .setOrigin(0.5),
    );
    const closeBtn = new Button({
      scene: this,
      x: w / 2 + scaled(220),
      y: h / 2 - scaled(185),
      w: scaled(36),
      h: scaled(36),
      label: '✕',
      style: 'danger',
      onClick: () => this._closeActivePanel(),
    }).setDepth(11);
    panel.add(closeBtn);
    return panel;
  }

  // ── Enemy group selector ────────────────────────────────────────────────────

  private _showEnemyGroupSelector(): void {
    if (this._activePanelKey) {
      this._closeActivePanel();
      return;
    }

    if (this._enemySelector) {
      this._enemySelector.destroy();
      this._enemySelector = null;
      return;
    }

    const panelW = 200;
    const panelH = 3 * 50 + 20;
    const panelX = this.scale.width / 2 - panelW / 2;
    const panelY = this.scale.height - panelH - 80;
    this._enemySelector = new EnemyGroupSelector(this, panelX, panelY, (groupId) => {
      PhaseManager.transition({ type: 'start_battle', enemyGroupId: groupId });
    });
    this._enemySelector.on('destroy', () => { this._enemySelector = null; });
  }
}
