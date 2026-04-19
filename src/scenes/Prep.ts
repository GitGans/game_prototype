import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { GameState } from "../core/GameState";
import { PhaseManager } from "../core/PhaseManager";
import { PLAYER_UNITS } from "../data/unitDefinitions";
import { EquipSlot, UnitBlueprint, UnitClass } from "../battle/types";
import { ITEM_DEFINITIONS } from "../data/itemDefinitions";
import {
  equipItem,
  unequipItem,
  canUnitEquipItem,
  getEquippedBonuses,
} from "../battle/itemOps";

export class Prep extends Phaser.Scene {
  private _itemDescPanel: Phaser.GameObjects.Container | null = null;
  private _activePanel: Phaser.GameObjects.Container | null = null;
  private _isCampMode = false;
  private battleBtn!: Phaser.GameObjects.Rectangle;
  private battleBtnText!: Phaser.GameObjects.Text;

  constructor() {
    super("Prep");
  }

  private _showItemHover(
    instanceId: string,
    unitClass: UnitClass,
    anchorX: number,
    anchorY: number,
  ): void {
    this._itemDescPanel?.destroy(true);

    const inst = GameState.itemInstances[instanceId];
    const def = inst ? ITEM_DEFINITIONS[inst.definitionId] : undefined;
    if (!def) return;

    const STAT_LABELS: [keyof typeof def.statBonuses, string][] = [
      ["hp", "HP"],
      ["physicalDamage", "Phys Dmg"],
      ["magicalDamage", "Magic Dmg"],
      ["physicalDefense", "Phys Def"],
      ["magicalDefense", "Magic Def"],
    ];

    const statEntries = STAT_LABELS.filter(
      ([k]) => (def.statBonuses[k] ?? 0) !== 0,
    ).map(([k, label]) => ({ label, value: def.statBonuses[k] as number }));

    const hasClassRestriction =
      def.allowedClasses !== undefined && def.allowedClasses.length > 0;
    const classLineColor = hasClassRestriction
      ? def.allowedClasses!.includes(unitClass)
        ? "#44ff88"
        : "#ff4444"
      : "#cccccc";

    const totalLines = 1 + statEntries.length + (hasClassRestriction ? 1 : 0);

    const panelW = Math.round(250 * LAYOUT_SCALE);
    const lineH = Math.round(16 * LAYOUT_SCALE);
    const padV = Math.round(8 * LAYOUT_SCALE);
    const padH = Math.round(8 * LAYOUT_SCALE);
    const panelH = padV * 2 + totalLines * lineH;

    const GAP = Math.round(6 * LAYOUT_SCALE);
    const panelX = anchorX + GAP + panelW / 2;
    const panelY = anchorY;

    const panel = this.add.container(0, 0).setDepth(50);

    panel.add(
      this.add
        .rectangle(panelX, panelY, panelW + 2, panelH + 2, 0x6666aa)
        .setDepth(49),
    );
    panel.add(
      this.add
        .rectangle(panelX, panelY, panelW, panelH, 0x111122)
        .setAlpha(0.95)
        .setDepth(50),
    );

    const textX = panelX - panelW / 2 + padH;
    const topY = panelY - panelH / 2 + padV;
    const valCol = Math.round(90 * LAYOUT_SCALE);

    // Line 0: item name
    panel.add(
      this.add
        .text(textX, topY, def.name, {
          fontSize: `${Math.round(12 * LAYOUT_SCALE)}px`,
          color: "#ffdd44",
          fontStyle: "bold",
        })
        .setDepth(51),
    );

    // Lines 1..N: stats — label (gray) + value (green if positive, red if negative)
    statEntries.forEach(({ label, value }, i) => {
      const y = topY + (i + 1) * lineH;
      const valueColor = value > 0 ? "#44ff88" : "#ff4444";
      const sign = value > 0 ? "+" : "";

      panel.add(
        this.add
          .text(textX, y, `${label}:`, {
            fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
            color: "#cccccc",
          })
          .setDepth(51),
      );
      panel.add(
        this.add
          .text(textX + valCol, y, `${sign}${value}`, {
            fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
            color: valueColor,
          })
          .setDepth(51),
      );
    });

    // Last line: class restriction
    if (hasClassRestriction) {
      const y = topY + (1 + statEntries.length) * lineH;
      panel.add(
        this.add
          .text(textX, y, `Classes: ${def.allowedClasses!.join(", ")}`, {
            fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
            color: classLineColor,
            wordWrap: { width: panelW - padH * 2 },
          })
          .setDepth(51),
      );
    }

    this._itemDescPanel = panel;
  }

  private _clearItemDesc(): void {
    this._itemDescPanel?.destroy(true);
    this._itemDescPanel = null;
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
      row.on("pointerup", () => this.showUnitDetail(panel, bp, w, h));

      panel.add([row, rowLabel]);
    });
  }

  // ── Unit Detail ─────────────────────────────────────────────────────────────

  private showUnitDetail(
    partyPanel: Phaser.GameObjects.Container,
    bp: UnitBlueprint,
    w: number,
    h: number,
  ): void {
    this._clearItemDesc();
    const detail = this.add.container(0, 0).setDepth(20);

    const onEsc = () => {
      detail.destroy(true);
      this._clearItemDesc();
      this.refreshPartyPanel(partyPanel, w, h);
      partyPanel.setVisible(true);
      this._activePanel = partyPanel;
    };
    this.input.keyboard!.once("keydown-ESC", onEsc);

    // ── Transparent overlay: click empty area → close description panel ───────
    const overlay = this.add
      .rectangle(w / 2, h / 2, w, h, 0x000000, 0)
      .setInteractive()
      .setDepth(19);
    detail.add(overlay);
    overlay.on("pointerup", () => {
      this._clearItemDesc();
    });

    // ── Window ────────────────────────────────────────────────────────────────
    const WIN_W = Math.round(860 * LAYOUT_SCALE);
    const WIN_H = Math.round(560 * LAYOUT_SCALE);
    const winCY = Math.max(WIN_H / 2 + 10, h / 2);
    detail.add(
      this.add.rectangle(w / 2, winCY, WIN_W, WIN_H, 0x1a1a3a).setDepth(20),
    );

    // ── Close button (×) ─────────────────────────────────────────────────────
    const closeBtn = this.add
      .text(
        w / 2 - WIN_W / 2 + WIN_W - Math.round(10 * LAYOUT_SCALE),
        winCY - WIN_H / 2 + Math.round(18 * LAYOUT_SCALE),
        "×",
        { fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`, color: "#aaaaaa" },
      )
      .setOrigin(1, 0.5)
      .setDepth(23)
      .setInteractive({ useHandCursor: true });
    detail.add(closeBtn);
    closeBtn.on("pointerover", () => closeBtn.setColor("#ffffff"));
    closeBtn.on("pointerout", () => closeBtn.setColor("#aaaaaa"));
    closeBtn.on("pointerup", () => {
      this.input.keyboard!.off("keydown-ESC", onEsc);
      onEsc();
    });

    // ── Header ────────────────────────────────────────────────────────────────
    const level = GameState.playerUnitLevels[bp.templateId] ?? bp.level;
    const scale = 1 + 0.1 * (level - 1);
    const bonuses = getEquippedBonuses(
      bp.templateId,
      GameState.itemContainers,
      GameState.itemInstances,
      ITEM_DEFINITIONS,
    );
    detail.add(
      this.add
        .text(
          w / 2,
          winCY - WIN_H / 2 + Math.round(16 * LAYOUT_SCALE),
          `${bp.name}  —  Level ${level}`,
          {
            fontSize: `${Math.round(18 * LAYOUT_SCALE)}px`,
            color: "#ffdd44",
            fontStyle: "bold",
          },
        )
        .setOrigin(0.5, 0)
        .setDepth(21),
    );

    // ── Layout constants ──────────────────────────────────────────────────────
    const PAD = Math.round(16 * LAYOUT_SCALE);
    const EQ_CELL = Math.round(64 * LAYOUT_SCALE); // equipment cell size
    const EQ_COL_STEP = Math.round(72 * LAYOUT_SCALE); // col stride (64 + 8 gap)
    const EQ_ROW_STEP = Math.round(72 * LAYOUT_SCALE); // row stride (64 + 8 gap)
    const SPRITE_SIZE = Math.round(256 * LAYOUT_SCALE);
    const BP_CELL = Math.round(64 * LAYOUT_SCALE);
    const BP_GAP = Math.round(6 * LAYOUT_SCALE);
    const BP_COLS = 10;
    const BP_ROWS = 1;
    const HEADER_H = Math.round(36 * LAYOUT_SCALE);

    const winLeft = w / 2 - WIN_W / 2;
    const contentTopY = winCY - WIN_H / 2 + HEADER_H + PAD;

    // Equipment block: column centers, relative to window left
    const eqColCenters = [
      winLeft + PAD + EQ_CELL / 2,
      winLeft + PAD + EQ_CELL / 2 + EQ_COL_STEP,
      winLeft + PAD + EQ_CELL / 2 + 2 * EQ_COL_STEP,
    ];
    // Sprite block center X
    const EQ_BLOCK_W = 3 * EQ_COL_STEP;
    const spriteX = winLeft + PAD + EQ_BLOCK_W + PAD + SPRITE_SIZE / 2;
    const spriteY = contentTopY + SPRITE_SIZE / 2;
    // Skill block X start
    const skillX = spriteX + SPRITE_SIZE / 2 + PAD;
    const skillY = contentTopY;
    const rightPanelW = winLeft + WIN_W - PAD - skillX;

    // ── LEFT: Equipment silhouette ────────────────────────────────────────────
    const EQUIP_SILHOUETTE: { slot: EquipSlot; col: 0 | 1 | 2; row: number }[] =
      [
        { slot: "necklace", col: 0, row: 0 },
        { slot: "helmet", col: 1, row: 0 },
        { slot: "artifact", col: 2, row: 0 },
        { slot: "hand_left", col: 0, row: 1 },
        { slot: "armor", col: 1, row: 1 },
        { slot: "hand_right", col: 2, row: 1 },
        { slot: "ring_1", col: 0, row: 2 },
        { slot: "belt", col: 1, row: 2 },
        { slot: "ring_2", col: 2, row: 2 },
        { slot: "gloves", col: 0, row: 3 },
        { slot: "boots", col: 1, row: 3 },
        // col 2, row 3 → empty placeholder (drawn separately below)
      ];

    const SLOT_ICONS: Partial<Record<EquipSlot, string>> = {
      helmet: "🪖",
      necklace: "📿",
      armor: "🥋",
      belt: "▬",
      hand_left: "🛡️",
      hand_right: "⚔️",
      gloves: "🧤",
      ring_1: "💍",
      ring_2: "💍",
      boots: "👢",
      artifact: "🔮",
    };

    const equipContainer = GameState.itemContainers[`equip_${bp.templateId}`];

    EQUIP_SILHOUETTE.forEach(({ slot, col, row }) => {
      const cx = eqColCenters[col];
      const cy = contentTopY + row * EQ_ROW_STEP + EQ_CELL / 2;

      const equippedId = equipContainer?.slots[slot];
      const equippedInst = equippedId
        ? GameState.itemInstances[equippedId]
        : undefined;
      const equippedDef = equippedInst
        ? ITEM_DEFINITIONS[equippedInst.definitionId]
        : undefined;
      const bgColor = 0x1e1e2e;

      const cell = this.add
        .rectangle(cx, cy, EQ_CELL, EQ_CELL, bgColor)
        .setDepth(21);
      detail.add(cell);

      if (!equippedDef) {
        const icon = SLOT_ICONS[slot];
        if (icon) {
          detail.add(
            this.add
              .text(cx, cy, icon, {
                fontSize: `${Math.round(28 * LAYOUT_SCALE)}px`,
              })
              .setOrigin(0.5)
              .setDepth(22)
              .setAlpha(0.5),
          );
        }
        detail.add(
          this.add
            .rectangle(cx, cy, EQ_CELL, EQ_CELL, 0x000000)
            .setAlpha(0.45)
            .setDepth(23),
        );
      }

      if (equippedDef) {
        const itemSpriteKey = `sprite-item-${equippedInst!.definitionId}`;
        if (this.textures.exists(itemSpriteKey)) {
          detail.add(
            this.add
              .image(cx, cy, itemSpriteKey)
              .setDisplaySize(EQ_CELL, EQ_CELL)
              .setDepth(22),
          );
        }

        cell.setInteractive({ useHandCursor: true });
        cell.on("pointerover", () => {
          cell.setFillStyle(0x2e2e4e);
          this._showItemHover(equippedId!, bp.unitClass, cx + EQ_CELL / 2, cy);
        });
        cell.on("pointerout", () => {
          cell.setFillStyle(bgColor);
          this._clearItemDesc();
        });
        cell.on(
          "pointerup",
          (
            _p: Phaser.Input.Pointer,
            _lx: number,
            _ly: number,
            event: Phaser.Types.Input.EventData,
          ) => {
            event.stopPropagation();
            this._clearItemDesc();
            this.input.keyboard!.off("keydown-ESC", onEsc);
            unequipItem(
              bp.templateId,
              slot,
              GameState.itemContainers,
              GameState.itemInstances,
              ITEM_DEFINITIONS,
            );
            detail.destroy(true);
            this.showUnitDetail(partyPanel, bp, w, h);
          },
        );
      }
    });

    // Empty placeholder cell at col 2, row 3
    {
      const cx = eqColCenters[2];
      const cy = contentTopY + 3 * EQ_ROW_STEP + EQ_CELL / 2;
      detail.add(
        this.add.rectangle(cx, cy, EQ_CELL, EQ_CELL, 0x1e1e2e).setDepth(21),
      );
    }

    // ── CENTER: Unit sprite ───────────────────────────────────────────────────
    const textureKey = `sprite-${bp.templateId}`;
    if (this.textures.exists(textureKey)) {
      detail.add(
        this.add
          .image(spriteX, spriteY, textureKey, 0)
          .setDisplaySize(SPRITE_SIZE, SPRITE_SIZE)
          .setDepth(21),
      );
    } else {
      detail.add(
        this.add
          .rectangle(spriteX, spriteY, SPRITE_SIZE, SPRITE_SIZE, 0x4a4a6a)
          .setDepth(21),
      );
    }

    // ── RIGHT: Stats + Skill ─────────────────────────────────────────────────
    const lineH = Math.round(18 * LAYOUT_SCALE);
    let rightY = skillY;

    detail.add(
      this.add
        .text(skillX, rightY, "Stats", {
          fontSize: `${Math.round(13 * LAYOUT_SCALE)}px`,
          color: "#ffdd44",
          fontStyle: "bold",
          wordWrap: { width: rightPanelW },
        })
        .setDepth(21),
    );
    rightY += Math.round(20 * LAYOUT_SCALE);

    const statLines: { label: string; value: string }[] = [
      {
        label: "HP",
        value: String(Math.round(bp.hp * scale) + (bonuses.hp ?? 0)),
      },
      {
        label: "Phys Dmg",
        value: String(
          Math.round(bp.physicalDamage * scale) + (bonuses.physicalDamage ?? 0),
        ),
      },
      {
        label: "Magic Dmg",
        value: String(
          Math.round(bp.magicalDamage * scale) + (bonuses.magicalDamage ?? 0),
        ),
      },
      {
        label: "Phys Def",
        value: `${bp.physicalDefense + (bonuses.physicalDefense ?? 0)}%`,
      },
      {
        label: "Magic Def",
        value: `${bp.magicalDefense + (bonuses.magicalDefense ?? 0)}%`,
      },
      { label: "Dodge", value: `${bp.dodge}%` },
      { label: "Block", value: `${bp.block}%` },
      { label: "Initiative", value: String(bp.initiative) },
      // rowTrait is intentionally not displayed — it is an internal auto-placement hint, not a player-facing stat
    ];
    statLines.forEach(({ label, value }) => {
      detail.add(
        this.add
          .text(skillX, rightY, `${label}: ${value}`, {
            fontSize: `${Math.round(12 * LAYOUT_SCALE)}px`,
            color: "#cccccc",
            wordWrap: { width: rightPanelW },
          })
          .setDepth(21),
      );
      rightY += lineH;
    });

    rightY += Math.round(8 * LAYOUT_SCALE);
    detail.add(
      this.add
        .text(skillX, rightY, "Skill", {
          fontSize: `${Math.round(13 * LAYOUT_SCALE)}px`,
          color: "#ffdd44",
          fontStyle: "bold",
          wordWrap: { width: rightPanelW },
        })
        .setDepth(21),
    );
    rightY += Math.round(20 * LAYOUT_SCALE);

    const skill = bp.skill;
    if (skill) {
      const skillLines: { text: string; color: string }[] = [
        { text: skill.name, color: "#ffffff" },
        {
          text: skill.damageBlock
            ? `Damage: ${skill.damageBlock.damageType}`
            : `Effect only`,
          color: "#aaaaaa",
        },
      ];
      skillLines.forEach(({ text, color }) => {
        detail.add(
          this.add
            .text(skillX, rightY, text, {
              fontSize: `${Math.round(12 * LAYOUT_SCALE)}px`,
              color,
              wordWrap: { width: rightPanelW },
            })
            .setDepth(21),
        );
        rightY += lineH;
      });
    } else {
      detail.add(
        this.add
          .text(skillX, rightY, "No skill", {
            fontSize: `${Math.round(12 * LAYOUT_SCALE)}px`,
            color: "#555555",
            wordWrap: { width: rightPanelW },
          })
          .setDepth(21),
      );
    }

    // ── BOTTOM: Shared backpack ───────────────────────────────────────────────
    const backpackTopY = contentTopY + 4 * EQ_ROW_STEP + PAD;
    const bpGridX = winLeft + PAD;
    const bpGridY = backpackTopY + Math.round(20 * LAYOUT_SCALE);
    const backpackContainer = GameState.itemContainers["backpack_shared"];

    detail.add(
      this.add
        .text(bpGridX, backpackTopY, "Backpack", {
          fontSize: `${Math.round(13 * LAYOUT_SCALE)}px`,
          color: "#ffdd44",
          fontStyle: "bold",
        })
        .setDepth(21),
    );

    for (let row = 0; row < BP_ROWS; row++) {
      for (let col = 0; col < BP_COLS; col++) {
        const slotKey = String(row * BP_COLS + col);
        const cellCX = bpGridX + col * (BP_CELL + BP_GAP) + BP_CELL / 2;
        const cellCY = bpGridY + row * (BP_CELL + BP_GAP) + BP_CELL / 2;
        const instanceId = backpackContainer?.slots[slotKey];
        const instance = instanceId
          ? GameState.itemInstances[instanceId]
          : undefined;
        const def = instance
          ? ITEM_DEFINITIONS[instance.definitionId]
          : undefined;
        const allowed = def
          ? canUnitEquipItem(
              bp.unitClass,
              instanceId!,
              GameState.itemInstances,
              ITEM_DEFINITIONS,
            )
          : true;
        const bgColor = def ? (allowed ? 0x2a2a4a : 0x252535) : 0x1e1e2e;

        const cell = this.add
          .rectangle(cellCX, cellCY, BP_CELL, BP_CELL, bgColor)
          .setDepth(21);
        detail.add(cell);

        if (def) {
          const itemSpriteKey = `sprite-item-${instance!.definitionId}`;
          if (this.textures.exists(itemSpriteKey)) {
            detail.add(
              this.add
                .image(cellCX, cellCY, itemSpriteKey)
                .setDisplaySize(BP_CELL, BP_CELL)
                .setAlpha(allowed ? 1 : 0.4)
                .setDepth(22),
            );
          }

          if (allowed) {
            cell.setInteractive({ useHandCursor: true });
            cell.on("pointerover", () => {
              cell.setFillStyle(0x3a3a6a);
              this._showItemHover(
                instanceId!,
                bp.unitClass,
                cellCX + BP_CELL / 2,
                cellCY,
              );
            });
            cell.on("pointerout", () => {
              cell.setFillStyle(bgColor);
              this._clearItemDesc();
            });
            cell.on(
              "pointerup",
              (
                _p: Phaser.Input.Pointer,
                _lx: number,
                _ly: number,
                event: Phaser.Types.Input.EventData,
              ) => {
                if (!instanceId) return;
                event.stopPropagation();
                this._clearItemDesc();
                this.input.keyboard!.off("keydown-ESC", onEsc);
                equipItem(
                  bp.templateId,
                  bp.unitClass,
                  instanceId,
                  GameState.itemContainers,
                  GameState.itemInstances,
                  ITEM_DEFINITIONS,
                );
                detail.destroy(true);
                this.showUnitDetail(partyPanel, bp, w, h);
              },
            );
          }
        }
      }
    }

    // ── Back button ───────────────────────────────────────────────────────────
    const backBtnY = winCY + WIN_H / 2 - Math.round(24 * LAYOUT_SCALE);
    const backBtn = this.add
      .rectangle(
        w / 2,
        backBtnY,
        Math.round(120 * LAYOUT_SCALE),
        Math.round(30 * LAYOUT_SCALE),
        0x4a4a6a,
      )
      .setInteractive({ useHandCursor: true })
      .setDepth(21);
    detail.add(backBtn);
    detail.add(
      this.add
        .text(w / 2, backBtnY, "← Back", {
          fontSize: `${Math.round(13 * LAYOUT_SCALE)}px`,
          color: "#ffffff",
        })
        .setOrigin(0.5)
        .setDepth(22),
    );
    backBtn.on("pointerover", () => backBtn.setFillStyle(0x5a5a8a));
    backBtn.on("pointerout", () => backBtn.setFillStyle(0x4a4a6a));
    backBtn.on("pointerup", () => {
      this.input.keyboard!.off("keydown-ESC", onEsc);
      detail.destroy(true);
      this.refreshPartyPanel(partyPanel, w, h);
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

    const closeBtn = this.add
      .rectangle(
        x,
        y,
        Math.round(36 * LAYOUT_SCALE),
        Math.round(36 * LAYOUT_SCALE),
        0x6a2a2a,
      )
      .setInteractive({ useHandCursor: true })
      .setDepth(11);
    const closeText = this.add
      .text(x, y, "✕", {
        fontSize: `${Math.round(16 * LAYOUT_SCALE)}px`,
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setDepth(12);

    closeBtn.on("pointerup", () => {
      panel.setVisible(false);
      this._activePanel = null;
    });
    panel.add([closeBtn, closeText]);
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
      const btn = this.add
        .rectangle(panelW / 2, btnY, 160, 38, 0x334466)
        .setInteractive({ useHandCursor: true });
      const txt = this.add.text(panelW / 2, btnY, label, {
        fontSize: '18px', color: '#ffffff',
      }).setOrigin(0.5);

      btn.on('pointerover', () => btn.setFillStyle(0x4455aa));
      btn.on('pointerout',  () => btn.setFillStyle(0x334466));
      btn.on('pointerup',   () => {
        container.destroy();
        this._activePanel = null;
        PhaseManager.transition({ type: 'start_battle', enemyGroupId: groupId });
      });

      container.add([btn, txt]);
    });

    this._activePanel = container;
  }
}
