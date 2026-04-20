import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { GameState } from "../core/GameState";
import { PhaseManager } from "../core/PhaseManager";
import { PLAYER_UNITS } from "../data/unitDefinitions";
import { Button } from "../ui/Button";

export class Prep extends Phaser.Scene {
  private _activePanel: Phaser.GameObjects.Container | null = null;
  private _isCampMode = false;
  private battleBtn!: Phaser.GameObjects.Rectangle;
  private battleBtnText!: Phaser.GameObjects.Text;

  constructor() {
    super("Prep");
  }

  create(): void {
    const phase = PhaseManager.getPhase();
    this._isCampMode = phase.type === 'camp';

    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(w / 2, h / 2, w, h, 0x1a1a2e);
    this.add
      .text(w / 2, Math.round(60 * LAYOUT_SCALE), "PREPARATION", {
        fontSize: `${Math.round(32 * LAYOUT_SCALE)}px`,
        color: "#cccccc",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // ── Build panels (hidden by default) ───────────────────────────────────────
    const campPanel = this.buildCampPanel(w, h);
    const shopPanel = this.buildShopPanel(w, h);
    const partyPanel = this.buildPartyPanel(w, h);
    const panels: Record<string, Phaser.GameObjects.Container> = {
      camp: campPanel,
      shop: shopPanel,
      party: partyPanel,
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
          color: "#ffffff",
        })
        .setOrigin(0.5);

      icon.on("pointerover", () => icon.setAlpha(0.8));
      icon.on("pointerout", () => icon.setAlpha(1));
      icon.on("pointerup", () => {
        Object.values(panels).forEach((p) => p.setVisible(false));
        panels[key].setVisible(true);
        this._activePanel = panels[key];
        if (key === "camp") this.refreshCampPanel(campPanel, w, h);
        if (key === "party") this.refreshPartyPanel(partyPanel, w, h);
      });
    });

    // ── Go to Battle button ────────────────────────────────────────────────────
    const btnW = Math.round(220 * LAYOUT_SCALE);
    const btnH = Math.round(56 * LAYOUT_SCALE);
    const btnY = h / 2 + Math.round(160 * LAYOUT_SCALE);

    this.battleBtn = this.add
      .rectangle(w / 2, btnY, btnW, btnH, 0x2a6a2a)
      .setInteractive({ useHandCursor: true });
    this.battleBtnText = this.add
      .text(w / 2, btnY, "Go to Battle", {
        fontSize: `${Math.round(18 * LAYOUT_SCALE)}px`,
        color: "#ffffff",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5);

    if (this._isCampMode) {
      this.battleBtnText.setText('Exit Camp');
      this.battleBtn.setFillStyle(0x2a6a2a);
      this.battleBtn.setInteractive({ useHandCursor: true });
      this.battleBtn.on('pointerup', () =>
        PhaseManager.transition({ type: 'exit_camp' })
      );
    } else {
      this.battleBtn.on('pointerup', () => this._showEnemyGroupSelector());
    }
    this.refreshBattleButton();
  }

  // ── Battle button helpers ───────────────────────────────────────────────────

  private getActiveCount(): number {
    return PLAYER_UNITS.length - GameState.campUnitIds.length;
  }

  private refreshBattleButton(): void {
    if (this._isCampMode) return;

    const active = this.getActiveCount();
    const valid = active > 0 && active <= 9;
    const excess = active - 9;

    this.battleBtn.setFillStyle(valid ? 0x2a6a2a : 0x6a2a2a);

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
        0x222244,
      ),
    );
    panel.add(
      this.add
        .text(w / 2, h / 2 - Math.round(170 * LAYOUT_SCALE), "Camp", {
          fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
          color: "#ffdd44",
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
            color: "#aaaaaa",
          },
        )
        .setOrigin(0.5),
    );
    this.addCloseButton(panel, w, h);
    return panel;
  }

  // Refreshes the dynamic unit rows inside the camp panel.
  // First 4 items in panel.list are permanent (bg, title, subtitle, close btn).
  private refreshCampPanel(
    panel: Phaser.GameObjects.Container,
    w: number,
    h: number,
  ): void {
    while (panel.list.length > 4) {
      (
        panel.list[panel.list.length - 1] as Phaser.GameObjects.GameObject
      ).destroy();
    }

    const startY = h / 2 - Math.round(100 * LAYOUT_SCALE);
    const rowH = Math.round(40 * LAYOUT_SCALE);

    PLAYER_UNITS.forEach((bp, i) => {
      const y = startY + i * rowH;
      const inCamp = GameState.campUnitIds.includes(bp.templateId);
      const level = GameState.playerUnitLevels[bp.templateId] ?? bp.level;

      const label = this.add
        .text(
          w / 2 - Math.round(180 * LAYOUT_SCALE),
          y,
          `${bp.name}  Lv.${level}`,
          { fontSize: `${Math.round(15 * LAYOUT_SCALE)}px`, color: "#ffffff" },
        )
        .setDepth(11);

      const toggleColor = inCamp ? 0x884444 : 0x448844;
      const toggleLabel = inCamp ? "In Camp" : "Active";
      const toggleBtnX = w / 2 + Math.round(150 * LAYOUT_SCALE);
      const toggleBtnY = y + Math.round(8 * LAYOUT_SCALE);

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
          color: "#ffffff",
        })
        .setOrigin(0.5)
        .setDepth(12);

      toggleBtn.on("pointerup", () => {
        const ids = GameState.campUnitIds;
        const idx = ids.indexOf(bp.templateId);
        const isCurrentlyActive = idx < 0;

        // Prevent sending the last active unit to camp
        if (isCurrentlyActive && this.getActiveCount() <= 1) return;

        if (idx >= 0) ids.splice(idx, 1);
        else ids.push(bp.templateId);
        this.refreshCampPanel(panel, w, h);
        this.refreshBattleButton();
      });

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
        0x222244,
      ),
    );
    panel.add(
      this.add
        .text(w / 2, h / 2 - Math.round(160 * LAYOUT_SCALE), "Shop", {
          fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
          color: "#ffdd44",
          fontStyle: "bold",
        })
        .setOrigin(0.5),
    );
    panel.add(
      this.add
        .text(w / 2, h / 2, "Coming soon...", {
          fontSize: `${Math.round(18 * LAYOUT_SCALE)}px`,
          color: "#888888",
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
        0x222244,
      ),
    );
    panel.add(
      this.add
        .text(w / 2, h / 2 - Math.round(180 * LAYOUT_SCALE), "Party", {
          fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
          color: "#ffdd44",
          fontStyle: "bold",
        })
        .setOrigin(0.5),
    );
    this.addCloseButton(panel, w, h);
    return panel;
  }

  // Refreshes unit rows in the party panel.
  // First 3 items are permanent (bg, title, close btn).
  private refreshPartyPanel(
    panel: Phaser.GameObjects.Container,
    w: number,
    h: number,
  ): void {
    while (panel.list.length > 3) {
      (
        panel.list[panel.list.length - 1] as Phaser.GameObjects.GameObject
      ).destroy();
    }

    const startY = h / 2 - Math.round(140 * LAYOUT_SCALE);
    const rowH = Math.round(38 * LAYOUT_SCALE);

    PLAYER_UNITS.forEach((bp, i) => {
      const y = startY + i * rowH;
      const level = GameState.playerUnitLevels[bp.templateId] ?? bp.level;
      const inCamp = GameState.campUnitIds.includes(bp.templateId);
      const status = inCamp ? " [Camp]" : "";

      const row = this.add
        .rectangle(
          w / 2,
          y + Math.round(10 * LAYOUT_SCALE),
          Math.round(420 * LAYOUT_SCALE),
          Math.round(32 * LAYOUT_SCALE),
          0x333366,
        )
        .setInteractive({ useHandCursor: true })
        .setDepth(11);
      const rowLabel = this.add
        .text(
          w / 2 - Math.round(190 * LAYOUT_SCALE),
          y,
          `${bp.name}  Lv.${level}${status}`,
          { fontSize: `${Math.round(15 * LAYOUT_SCALE)}px`, color: "#ffffff" },
        )
        .setDepth(12);

      row.on("pointerover", () => row.setFillStyle(0x4444aa));
      row.on("pointerout", () => row.setFillStyle(0x333366));
      row.on("pointerup", () =>
        PhaseManager.transition({ type: 'open_equip_screen', unitTemplateId: bp.templateId })
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

    const races: { label: string; groupId: string }[] = [
      { label: 'Orcs',   groupId: 'orc_patrol'  },
      { label: 'Demons', groupId: 'demon_patrol' },
      { label: 'Undead', groupId: 'undead_horde' },
    ];

    const panelW = 200;
    const panelH = races.length * 50 + 20;
    const panelX = this.scale.width / 2 - panelW / 2;
    const panelY = this.scale.height - panelH - 80;

    const container = this.add.container(panelX, panelY);
    container.add(
      this.add.rectangle(panelW / 2, panelH / 2, panelW, panelH, 0x222244, 0.95)
    );

    races.forEach(({ label, groupId }, i) => {
      const btnY = 20 + i * 50 + 15;
      const btn = new Button({
        scene: this, x: panelW / 2, y: btnY, w: 160, h: 38,
        label, style: "ghost",
        onClick: () => {
          container.destroy();
          this._activePanel = null;
          PhaseManager.transition({ type: 'start_battle', enemyGroupId: groupId });
        },
      });
      container.add(btn);
    });

    this._activePanel = container;
  }
}
