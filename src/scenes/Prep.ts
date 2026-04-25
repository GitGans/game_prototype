import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { PhaseManager } from "../core/PhaseManager";
import { EventBus, Events } from "../core/EventBus";
import { Button } from "../ui/Button";
import { VALUE_COLOR, SCENE_BG, BTN, ALPHA } from "../ui/theme";
import { EnemyGroupSelector } from "../objects/EnemyGroupSelector";

export class Prep extends Phaser.Scene {
  private _activePanel: Phaser.GameObjects.Container | null = null;
  private _isCampMode = false;
  private battleBtn!: Phaser.GameObjects.Rectangle;
  private battleBtnText!: Phaser.GameObjects.Text;
  private campPanel!: Phaser.GameObjects.Container;
  private partyPanel!: Phaser.GameObjects.Container;
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

    this.add.rectangle(w / 2, h / 2, w, h, SCENE_BG.default);
    this.add
      .text(w / 2, Math.round(60 * LAYOUT_SCALE), "PREPARATION", {
        fontSize: `${Math.round(32 * LAYOUT_SCALE)}px`,
        color: VALUE_COLOR.neutral,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // ── Build panels (hidden by default) ───────────────────────────────────────
    this.campPanel  = this.buildCampPanel(w, h);
    const shopPanel = this.buildShopPanel(w, h);
    this.partyPanel = this.buildPartyPanel(w, h);
    const panels: Record<string, Phaser.GameObjects.Container> = {
      camp:  this.campPanel,
      shop:  shopPanel,
      party: this.partyPanel,
    };

    this.input.keyboard!.on("keydown-ESC", () => {
      if (this._activePanel) {
        this._activePanel.setVisible(false);
        this._activePanel = null;
      }
    });

    // ── Three icon buttons ─────────────────────────────────────────────────────
    const iconSize = Math.round(90 * LAYOUT_SCALE);
    const iconY = h / 2 - Math.round(60 * LAYOUT_SCALE);
    const spacing = Math.round(160 * LAYOUT_SCALE);
    const iconDefs: Array<{ label: string; color: number; key: string }> = [
      { label: "Camp", color: 0x5a3a1a, key: "camp" },
      { label: "Shop", color: 0x1a3a5a, key: "shop" },
      { label: "Party", color: 0x3a1a5a, key: "party" },
    ];

    iconDefs.forEach(({ label, color, key }, i) => {
      const x = w / 2 + (i - 1) * spacing;
      const icon = this.add
        .rectangle(x, iconY, iconSize, iconSize, color)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, iconY, label, {
          fontSize: `${Math.round(14 * LAYOUT_SCALE)}px`,
          color: VALUE_COLOR.white,
        })
        .setOrigin(0.5);

      icon.on("pointerover", () => icon.setAlpha(ALPHA.hover));
      icon.on("pointerout", () => icon.setAlpha(ALPHA.active));
      icon.on("pointerup", () => {
        Object.values(panels).forEach((p) => p.setVisible(false));
        panels[key].setVisible(true);
        this._activePanel = panels[key];
        if (key === "camp")  this.refreshCampPanel();
        if (key === "party") this.refreshPartyPanel();
      });
    });

    // ── Go to Battle button ────────────────────────────────────────────────────
    const btnW = Math.round(220 * LAYOUT_SCALE);
    const btnH = Math.round(56 * LAYOUT_SCALE);
    const btnY = h / 2 + Math.round(160 * LAYOUT_SCALE);

    this.battleBtn = this.add
      .rectangle(w / 2, btnY, btnW, btnH, BTN.primary.base)
      .setInteractive({ useHandCursor: true });
    this.battleBtnText = this.add
      .text(w / 2, btnY, "Go to Battle", {
        fontSize: `${Math.round(18 * LAYOUT_SCALE)}px`,
        color: VALUE_COLOR.white,
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5);

    if (this._isCampMode) {
      this.battleBtnText.setText('Exit Camp');
      this.battleBtn.setFillStyle(BTN.primary.base);
      this.battleBtn.setInteractive({ useHandCursor: true });
      this.battleBtn.on('pointerup', () =>
        PhaseManager.transition({ type: 'exit_camp' })
      );
    } else {
      this.battleBtn.on('pointerup', () => this._showEnemyGroupSelector());
    }
    this.refreshBattleButton();

    EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  shutdown(): void {
    EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  // ── State change handler ────────────────────────────────────────────────────

  private onStateChanged(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'camp') return;
    if (this._activePanel === this.campPanel)  this.refreshCampPanel();
    if (this._activePanel === this.partyPanel) this.refreshPartyPanel();
    this.refreshBattleButton();
  }

  // ── Battle button helpers ───────────────────────────────────────────────────

  private getActiveCount(): number {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'camp') return 0;
    return phase.units.filter(u => !u.inCamp).length;
  }

  private refreshBattleButton(): void {
    if (this._isCampMode) return;

    const active = this.getActiveCount();
    const valid = active > 0 && active <= 9;
    const excess = active - 9;

    this.battleBtn.setFillStyle(valid ? BTN.primary.base : BTN.danger.base);

    let label = "Go to Battle";
    if (active === 0) {
      label = "Go to Battle\n(party is empty)";
    } else if (excess > 0) {
      label = `Go to Battle\n(move ${excess} to camp)`;
    }
    this.battleBtnText.setText(label);

    if (valid) {
      this.battleBtn.setInteractive({ useHandCursor: true });
    } else {
      this.battleBtn.disableInteractive();
    }
  }

  // ── Camp Panel ──────────────────────────────────────────────────────────────

  private buildCampPanel(w: number, h: number): Phaser.GameObjects.Container {
    const panel = this.add.container(0, 0).setVisible(false).setDepth(10);
    panel.add(
      this.add.rectangle(
        w / 2,
        h / 2,
        Math.round(500 * LAYOUT_SCALE),
        Math.round(400 * LAYOUT_SCALE),
        SCENE_BG.panel,
      ),
    );
    panel.add(
      this.add
        .text(w / 2, h / 2 - Math.round(170 * LAYOUT_SCALE), "Camp", {
          fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
          color: VALUE_COLOR.highlight,
          fontStyle: "bold",
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(
          w / 2,
          h / 2 - Math.round(140 * LAYOUT_SCALE),
          "Units in camp don't join battle",
          {
            fontSize: `${Math.round(13 * LAYOUT_SCALE)}px`,
            color: VALUE_COLOR.muted,
          },
        )
        .setOrigin(0.5),
    );
    this.addCloseButton(panel, w, h);
    return panel;
  }

  // Refreshes the dynamic unit rows inside the camp panel.
  // First 4 items in panel.list are permanent (bg, title, subtitle, close btn).
  private refreshCampPanel(): void {
    const panel = this.campPanel;
    const w = this._w;
    const h = this._h;
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'camp') return;

    while (panel.list.length > 4) {
      (panel.list[panel.list.length - 1] as Phaser.GameObjects.GameObject).destroy();
    }

    const startY = h / 2 - Math.round(100 * LAYOUT_SCALE);
    const rowH   = Math.round(40 * LAYOUT_SCALE);

    phase.units.forEach((unit, i) => {
      const y = startY + i * rowH;
      const { inCamp, level, name, templateId } = unit;
      const toggleColor = inCamp ? BTN.danger.base : BTN.primary.base;
      const toggleLabel = inCamp ? "In Camp" : "Active";
      const toggleBtnX  = w / 2 + Math.round(150 * LAYOUT_SCALE);
      const toggleBtnY  = y + Math.round(8 * LAYOUT_SCALE);

      const label = this.add
        .text(
          w / 2 - Math.round(180 * LAYOUT_SCALE),
          y,
          `${name}  Lv.${level}`,
          { fontSize: `${Math.round(15 * LAYOUT_SCALE)}px`, color: VALUE_COLOR.white },
        )
        .setDepth(11);

      const toggleBtn = this.add
        .rectangle(
          toggleBtnX,
          toggleBtnY,
          Math.round(100 * LAYOUT_SCALE),
          Math.round(28 * LAYOUT_SCALE),
          toggleColor,
        )
        .setInteractive({ useHandCursor: true })
        .setDepth(11);
      const toggleText = this.add
        .text(toggleBtnX, toggleBtnY, toggleLabel, {
          fontSize: `${Math.round(13 * LAYOUT_SCALE)}px`,
          color: VALUE_COLOR.white,
        })
        .setOrigin(0.5)
        .setDepth(12);

      toggleBtn.on("pointerup", () =>
        PhaseManager.transition({ type: 'toggle_camp_unit', templateId }),
      );

      panel.add([label, toggleBtn, toggleText]);
    });
  }

  // ── Shop Panel ──────────────────────────────────────────────────────────────

  private buildShopPanel(w: number, h: number): Phaser.GameObjects.Container {
    const panel = this.add.container(0, 0).setVisible(false).setDepth(10);
    panel.add(
      this.add.rectangle(
        w / 2,
        h / 2,
        Math.round(500 * LAYOUT_SCALE),
        Math.round(400 * LAYOUT_SCALE),
        SCENE_BG.panel,
      ),
    );
    panel.add(
      this.add
        .text(w / 2, h / 2 - Math.round(160 * LAYOUT_SCALE), "Shop", {
          fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
          color: VALUE_COLOR.highlight,
          fontStyle: "bold",
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(w / 2, h / 2, "Coming soon...", {
          fontSize: `${Math.round(18 * LAYOUT_SCALE)}px`,
          color: VALUE_COLOR.inactive,
        })
        .setOrigin(0.5),
    );
    this.addCloseButton(panel, w, h);
    return panel;
  }

  // ── Party Panel ─────────────────────────────────────────────────────────────

  private buildPartyPanel(w: number, h: number): Phaser.GameObjects.Container {
    const panel = this.add.container(0, 0).setVisible(false).setDepth(10);
    panel.add(
      this.add.rectangle(
        w / 2,
        h / 2,
        Math.round(500 * LAYOUT_SCALE),
        Math.round(420 * LAYOUT_SCALE),
        SCENE_BG.panel,
      ),
    );
    panel.add(
      this.add
        .text(w / 2, h / 2 - Math.round(180 * LAYOUT_SCALE), "Party", {
          fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
          color: VALUE_COLOR.highlight,
          fontStyle: "bold",
        })
        .setOrigin(0.5),
    );
    this.addCloseButton(panel, w, h);
    return panel;
  }

  // Refreshes unit rows in the party panel.
  // First 3 items are permanent (bg, title, close btn).
  private refreshPartyPanel(): void {
    const panel = this.partyPanel;
    const w = this._w;
    const h = this._h;
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'camp') return;

    while (panel.list.length > 3) {
      (panel.list[panel.list.length - 1] as Phaser.GameObjects.GameObject).destroy();
    }

    const startY = h / 2 - Math.round(140 * LAYOUT_SCALE);
    const rowH   = Math.round(38 * LAYOUT_SCALE);

    phase.units.forEach((unit, i) => {
      const y = startY + i * rowH;
      const { inCamp, level, name, templateId } = unit;
      const status = inCamp ? " [Camp]" : "";

      const row = this.add
        .rectangle(
          w / 2,
          y + Math.round(10 * LAYOUT_SCALE),
          Math.round(420 * LAYOUT_SCALE),
          Math.round(32 * LAYOUT_SCALE),
          BTN.ghost.base,
        )
        .setInteractive({ useHandCursor: true })
        .setDepth(11);
      const rowLabel = this.add
        .text(
          w / 2 - Math.round(190 * LAYOUT_SCALE),
          y,
          `${name}  Lv.${level}${status}`,
          { fontSize: `${Math.round(15 * LAYOUT_SCALE)}px`, color: VALUE_COLOR.white },
        )
        .setDepth(12);

      row.on("pointerover", () => row.setFillStyle(BTN.ghost.hover));
      row.on("pointerout",  () => row.setFillStyle(BTN.ghost.base));
      row.on("pointerup",   () =>
        PhaseManager.transition({ type: 'open_equip_screen', unitTemplateId: templateId })
      );

      panel.add([row, rowLabel]);
    });
  }

  // ── Shared helpers ──────────────────────────────────────────────────────────

  private addCloseButton(
    panel: Phaser.GameObjects.Container,
    w: number,
    h: number,
  ): void {
    const x = w / 2 + Math.round(220 * LAYOUT_SCALE);
    const y = h / 2 - Math.round(185 * LAYOUT_SCALE);
    const sz = Math.round(36 * LAYOUT_SCALE);

    const closeBtn = new Button({
      scene: this, x, y, w: sz, h: sz,
      label: "✕", style: "danger",
      onClick: () => {
        panel.setVisible(false);
        this._activePanel = null;
      },
    }).setDepth(11);
    panel.add(closeBtn);
  }

  private _showEnemyGroupSelector(): void {
    if (this._activePanel) {
      this._activePanel.destroy();
      this._activePanel = null;
      return;
    }
    const panelW = 200;
    const panelH = 3 * 50 + 20;
    const panelX = this.scale.width / 2 - panelW / 2;
    const panelY = this.scale.height - panelH - 80;
    this._activePanel = new EnemyGroupSelector(this, panelX, panelY);
    this._activePanel.on('destroy', () => { this._activePanel = null; });
  }
}
