import Phaser from "phaser";
import { LAYOUT_SCALE } from "../core/Constants";
import { GameState } from "../core/GameState";
import { PLAYER_UNITS } from "../data/unitDefinitions";
import { EquipSlot, UnitBlueprint } from "../battle/types";
import { ITEM_DEFINITIONS } from "../data/itemDefinitions";
import { equipItem, unequipItem, getEquippedBonuses } from "../battle/itemOps";

export class Prep extends Phaser.Scene {
  constructor() {
    super("Prep");
  }

  create(): void {
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
    const campPanel  = this.buildCampPanel(w, h);
    const shopPanel  = this.buildShopPanel(w, h);
    const partyPanel = this.buildPartyPanel(w, h);
    const panels: Record<string, Phaser.GameObjects.Container> = {
      camp:  campPanel,
      shop:  shopPanel,
      party: partyPanel,
    };

    // ── Three icon buttons ─────────────────────────────────────────────────────
    const iconSize = Math.round(90 * LAYOUT_SCALE);
    const iconY    = h / 2 - Math.round(60 * LAYOUT_SCALE);
    const spacing  = Math.round(160 * LAYOUT_SCALE);
    const iconDefs: Array<{ label: string; color: number; key: string }> = [
      { label: "Camp",  color: 0x5a3a1a, key: "camp"  },
      { label: "Shop",  color: 0x1a3a5a, key: "shop"  },
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
      icon.on("pointerout",  () => icon.setAlpha(1));
      icon.on("pointerup",   () => {
        Object.values(panels).forEach(p => p.setVisible(false));
        panels[key].setVisible(true);
        if (key === "camp")  this.refreshCampPanel(campPanel, w, h);
        if (key === "party") this.refreshPartyPanel(partyPanel, w, h);
      });
    });

    // ── Go to Battle button ────────────────────────────────────────────────────
    const btnW = Math.round(220 * LAYOUT_SCALE);
    const btnH = Math.round(56 * LAYOUT_SCALE);
    const btnY = h / 2 + Math.round(160 * LAYOUT_SCALE);

    const btn = this.add
      .rectangle(w / 2, btnY, btnW, btnH, 0x2a6a2a)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(w / 2, btnY, "Go to Battle", {
        fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    btn.on("pointerover", () => btn.setFillStyle(0x3a8a3a));
    btn.on("pointerout",  () => btn.setFillStyle(0x2a6a2a));
    btn.on("pointerup",   () => this.scene.start("Game"));
  }

  // ── Camp Panel ──────────────────────────────────────────────────────────────

  private buildCampPanel(w: number, h: number): Phaser.GameObjects.Container {
    const panel = this.add.container(0, 0).setVisible(false).setDepth(10);
    panel.add(this.add.rectangle(
      w / 2, h / 2,
      Math.round(500 * LAYOUT_SCALE), Math.round(400 * LAYOUT_SCALE),
      0x222244,
    ));
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
        .text(w / 2, h / 2 - Math.round(140 * LAYOUT_SCALE), "Units in camp don't join battle", {
          fontSize: `${Math.round(13 * LAYOUT_SCALE)}px`,
          color: "#aaaaaa",
        })
        .setOrigin(0.5),
    );
    this.addCloseButton(panel, w, h);
    return panel;
  }

  // Refreshes the dynamic unit rows inside the camp panel.
  // First 4 items in panel.list are permanent (bg, title, subtitle, close btn).
  private refreshCampPanel(panel: Phaser.GameObjects.Container, w: number, h: number): void {
    while (panel.list.length > 4) {
      (panel.list[panel.list.length - 1] as Phaser.GameObjects.GameObject).destroy();
    }

    const startY = h / 2 - Math.round(100 * LAYOUT_SCALE);
    const rowH   = Math.round(40 * LAYOUT_SCALE);

    PLAYER_UNITS.forEach((bp, i) => {
      const y      = startY + i * rowH;
      const inCamp = GameState.campUnitIds.includes(bp.templateId);
      const level  = GameState.playerUnitLevels[bp.templateId] ?? bp.level;

      const label = this.add
        .text(
          w / 2 - Math.round(180 * LAYOUT_SCALE), y,
          `${bp.name}  Lv.${level}`,
          { fontSize: `${Math.round(15 * LAYOUT_SCALE)}px`, color: "#ffffff" },
        )
        .setDepth(11);

      const toggleColor = inCamp ? 0x884444 : 0x448844;
      const toggleLabel = inCamp ? "In Camp" : "Active";
      const toggleBtnX  = w / 2 + Math.round(150 * LAYOUT_SCALE);
      const toggleBtnY  = y + Math.round(8 * LAYOUT_SCALE);

      const toggleBtn = this.add
        .rectangle(toggleBtnX, toggleBtnY, Math.round(100 * LAYOUT_SCALE), Math.round(28 * LAYOUT_SCALE), toggleColor)
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
        if (idx >= 0) ids.splice(idx, 1); else ids.push(bp.templateId);
        this.refreshCampPanel(panel, w, h);
      });

      panel.add([label, toggleBtn, toggleText]);
    });
  }

  // ── Shop Panel ──────────────────────────────────────────────────────────────

  private buildShopPanel(w: number, h: number): Phaser.GameObjects.Container {
    const panel = this.add.container(0, 0).setVisible(false).setDepth(10);
    panel.add(this.add.rectangle(
      w / 2, h / 2,
      Math.round(500 * LAYOUT_SCALE), Math.round(400 * LAYOUT_SCALE),
      0x222244,
    ));
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
    panel.add(this.add.rectangle(
      w / 2, h / 2,
      Math.round(500 * LAYOUT_SCALE), Math.round(420 * LAYOUT_SCALE),
      0x222244,
    ));
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
  private refreshPartyPanel(panel: Phaser.GameObjects.Container, w: number, h: number): void {
    while (panel.list.length > 3) {
      (panel.list[panel.list.length - 1] as Phaser.GameObjects.GameObject).destroy();
    }

    const startY = h / 2 - Math.round(140 * LAYOUT_SCALE);
    const rowH   = Math.round(38 * LAYOUT_SCALE);

    PLAYER_UNITS.forEach((bp, i) => {
      const y      = startY + i * rowH;
      const level  = GameState.playerUnitLevels[bp.templateId] ?? bp.level;
      const inCamp = GameState.campUnitIds.includes(bp.templateId);
      const status = inCamp ? " [Camp]" : "";

      const row = this.add
        .rectangle(
          w / 2, y + Math.round(10 * LAYOUT_SCALE),
          Math.round(420 * LAYOUT_SCALE), Math.round(32 * LAYOUT_SCALE),
          0x333366,
        )
        .setInteractive({ useHandCursor: true })
        .setDepth(11);
      const rowLabel = this.add
        .text(
          w / 2 - Math.round(190 * LAYOUT_SCALE), y,
          `${bp.name}  Lv.${level}${status}`,
          { fontSize: `${Math.round(15 * LAYOUT_SCALE)}px`, color: "#ffffff" },
        )
        .setDepth(12);

      row.on("pointerover", () => row.setFillStyle(0x4444aa));
      row.on("pointerout",  () => row.setFillStyle(0x333366));
      row.on("pointerup",   () => this.showUnitDetail(panel, bp, w, h));

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
    const detail = this.add.container(0, 0).setDepth(20);
    detail.add(this.add.rectangle(
      w / 2, h / 2,
      Math.round(560 * LAYOUT_SCALE), Math.round(540 * LAYOUT_SCALE),
      0x1a1a3a,
    ));

    const level = GameState.playerUnitLevels[bp.templateId] ?? bp.level;
    const scale = 1 + 0.1 * (level - 1);

    const bonuses = getEquippedBonuses(
      bp.templateId,
      GameState.itemContainers,
      GameState.itemInstances,
      ITEM_DEFINITIONS,
    );

    // ── Name + level header ──────────────────────────────────────────────────
    detail.add(
      this.add
        .text(w / 2, h / 2 - Math.round(245 * LAYOUT_SCALE), `${bp.name}  —  Level ${level}`, {
          fontSize: `${Math.round(20 * LAYOUT_SCALE)}px`,
          color: '#ffdd44',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(21),
    );

    // ── Sprite or fallback ───────────────────────────────────────────────────
    const textureKey = `sprite-${bp.templateId}`;
    const spriteX    = w / 2 - Math.round(160 * LAYOUT_SCALE);
    const spriteY    = h / 2 - Math.round(160 * LAYOUT_SCALE);
    if (this.textures.exists(textureKey)) {
      detail.add(
        this.add.image(spriteX, spriteY, textureKey, 0).setScale(LAYOUT_SCALE).setDepth(21),
      );
    } else {
      detail.add(
        this.add
          .rectangle(spriteX, spriteY, Math.round(80 * LAYOUT_SCALE), Math.round(80 * LAYOUT_SCALE), 0x4a4a6a)
          .setDepth(21),
      );
    }

    // ── Stats column (with item bonuses applied) ─────────────────────────────
    const statsX  = w / 2 - Math.round(20 * LAYOUT_SCALE);
    const statsY0 = h / 2 - Math.round(220 * LAYOUT_SCALE);
    const lineH   = Math.round(24 * LAYOUT_SCALE);
    const statLines: string[] = [
      `HP:            ${Math.round(bp.hp * scale) + (bonuses.hp ?? 0)}`,
      `Phys Damage:   ${Math.round(bp.physicalDamage * scale) + (bonuses.physicalDamage ?? 0)}`,
      `Magic Damage:  ${Math.round(bp.magicalDamage * scale) + (bonuses.magicalDamage ?? 0)}`,
      `Phys Defense:  ${bp.physicalDefense + (bonuses.physicalDefense ?? 0)}%`,
      `Magic Defense: ${bp.magicalDefense + (bonuses.magicalDefense ?? 0)}%`,
      `Heal Amount:   ${Math.round(bp.healAmount * scale) + (bonuses.healAmount ?? 0)}`,
      `Initiative:    ${bp.initiative}`,
      `Action:        ${bp.actionType}`,
      `Row:           ${bp.rowTrait}`,
      `Skill:         ${bp.skill?.name ?? '—'}`,
    ];
    statLines.forEach((line, i) => {
      detail.add(
        this.add
          .text(statsX, statsY0 + i * lineH, line, {
            fontSize: `${Math.round(13 * LAYOUT_SCALE)}px`,
            color: '#cccccc',
          })
          .setDepth(21),
      );
    });

    // ── Equipment section ────────────────────────────────────────────────────
    const equipSectionY = h / 2 + Math.round(50 * LAYOUT_SCALE);

    detail.add(
      this.add
        .text(w / 2 - Math.round(240 * LAYOUT_SCALE), equipSectionY, 'Equipment', {
          fontSize: `${Math.round(14 * LAYOUT_SCALE)}px`,
          color: '#ffdd44',
          fontStyle: 'bold',
        })
        .setDepth(21),
    );

    // One row per equipment slot. To add more slots: extend this array.
    const EQUIP_SLOTS: EquipSlot[] = ['accessory'];

    EQUIP_SLOTS.forEach((slot, i) => {
      const rowY = equipSectionY + Math.round(26 * LAYOUT_SCALE) + i * Math.round(28 * LAYOUT_SCALE);
      const equipContainer = GameState.itemContainers[`equip_${bp.templateId}`];
      const equippedId     = equipContainer?.slots[slot];
      const equippedInst   = equippedId ? GameState.itemInstances[equippedId] : undefined;
      const equippedDef    = equippedInst ? ITEM_DEFINITIONS[equippedInst.definitionId] : undefined;

      const labelText  = `${slot}: ${equippedDef ? equippedDef.name : '— empty —'}`;
      const labelColor = equippedDef ? '#aaffaa' : '#666666';

      if (equippedDef) {
        const btn = this.add
          .rectangle(
            w / 2, rowY + Math.round(10 * LAYOUT_SCALE),
            Math.round(420 * LAYOUT_SCALE), Math.round(24 * LAYOUT_SCALE),
            0x2a3a2a,
          )
          .setInteractive({ useHandCursor: true })
          .setDepth(21);
        detail.add(btn);

        btn.on('pointerover', () => btn.setFillStyle(0x3a4a3a));
        btn.on('pointerout',  () => btn.setFillStyle(0x2a3a2a));
        btn.on('pointerup', () => {
          unequipItem(
            bp.templateId, slot,
            GameState.itemContainers,
            GameState.itemInstances,
            ITEM_DEFINITIONS,
          );
          detail.destroy(true);
          this.showUnitDetail(partyPanel, bp, w, h);
        });
      }

      detail.add(
        this.add
          .text(w / 2 - Math.round(200 * LAYOUT_SCALE), rowY, labelText, {
            fontSize: `${Math.round(13 * LAYOUT_SCALE)}px`,
            color: labelColor,
          })
          .setDepth(22),
      );
    });

    // ── Backpack section ─────────────────────────────────────────────────────
    const backpackSectionY = equipSectionY
      + Math.round(30 * LAYOUT_SCALE)
      + EQUIP_SLOTS.length * Math.round(28 * LAYOUT_SCALE);

    detail.add(
      this.add
        .text(w / 2 - Math.round(240 * LAYOUT_SCALE), backpackSectionY, 'Backpack', {
          fontSize: `${Math.round(14 * LAYOUT_SCALE)}px`,
          color: '#ffdd44',
          fontStyle: 'bold',
        })
        .setDepth(21),
    );

    const COLS     = 3;
    const ROWS     = 8;
    const cellW    = Math.round(130 * LAYOUT_SCALE);
    const cellH    = Math.round(22 * LAYOUT_SCALE);
    const cellGap  = Math.round(4 * LAYOUT_SCALE);
    const gridStartX = w / 2 - Math.round(200 * LAYOUT_SCALE);
    const gridStartY = backpackSectionY + Math.round(24 * LAYOUT_SCALE);

    const backpackContainer = GameState.itemContainers[`backpack_${bp.templateId}`];

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const slotKey    = String(row * COLS + col);
        const cellX      = gridStartX + col * (cellW + cellGap);
        const cellY      = gridStartY + row * (cellH + cellGap);
        const instanceId = backpackContainer?.slots[slotKey];
        const instance   = instanceId ? GameState.itemInstances[instanceId] : undefined;
        const def        = instance ? ITEM_DEFINITIONS[instance.definitionId] : undefined;
        const bgColor    = def ? 0x2a2a4a : 0x1e1e2e;

        const cell = this.add
          .rectangle(cellX + cellW / 2, cellY + cellH / 2, cellW, cellH, bgColor)
          .setDepth(21);
        detail.add(cell);

        if (def) {
          cell.setInteractive({ useHandCursor: true });
          cell.on('pointerover', () => cell.setFillStyle(0x3a3a6a));
          cell.on('pointerout',  () => cell.setFillStyle(bgColor));
          cell.on('pointerup', () => {
            if (!instanceId) return;
            equipItem(
              bp.templateId, instanceId,
              GameState.itemContainers,
              GameState.itemInstances,
              ITEM_DEFINITIONS,
            );
            detail.destroy(true);
            this.showUnitDetail(partyPanel, bp, w, h);
          });

          const displayName = def.name.length > 12 ? def.name.slice(0, 11) + '…' : def.name;
          detail.add(
            this.add
              .text(cellX + Math.round(4 * LAYOUT_SCALE), cellY + Math.round(4 * LAYOUT_SCALE), displayName, {
                fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
                color: '#cccccc',
              })
              .setDepth(22),
          );
        }
      }
    }

    // ── Back button ──────────────────────────────────────────────────────────
    const backBtnY = h / 2 + Math.round(255 * LAYOUT_SCALE);
    const backBtn  = this.add
      .rectangle(w / 2, backBtnY, Math.round(120 * LAYOUT_SCALE), Math.round(34 * LAYOUT_SCALE), 0x4a4a6a)
      .setInteractive({ useHandCursor: true })
      .setDepth(21);
    detail.add(backBtn);
    detail.add(
      this.add
        .text(w / 2, backBtnY, '← Back', {
          fontSize: `${Math.round(14 * LAYOUT_SCALE)}px`,
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setDepth(22),
    );

    backBtn.on('pointerover', () => backBtn.setFillStyle(0x5a5a8a));
    backBtn.on('pointerout',  () => backBtn.setFillStyle(0x4a4a6a));
    backBtn.on('pointerup', () => {
      detail.destroy(true);
      this.refreshPartyPanel(partyPanel, w, h);
    });
  }

  // ── Shared helpers ──────────────────────────────────────────────────────────

  private addCloseButton(panel: Phaser.GameObjects.Container, w: number, h: number): void {
    const x = w / 2 + Math.round(220 * LAYOUT_SCALE);
    const y = h / 2 - Math.round(185 * LAYOUT_SCALE);

    const closeBtn = this.add
      .rectangle(x, y, Math.round(36 * LAYOUT_SCALE), Math.round(36 * LAYOUT_SCALE), 0x6a2a2a)
      .setInteractive({ useHandCursor: true })
      .setDepth(11);
    const closeText = this.add
      .text(x, y, "✕", {
        fontSize: `${Math.round(16 * LAYOUT_SCALE)}px`,
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setDepth(12);

    closeBtn.on("pointerup", () => panel.setVisible(false));
    panel.add([closeBtn, closeText]);
  }
}
