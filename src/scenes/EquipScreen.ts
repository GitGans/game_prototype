import Phaser from 'phaser';
import { LAYOUT_SCALE } from '../core/Constants';
import { PhaseManager } from '../core/PhaseManager';
import { EventBus, Events } from '../core/EventBus';
import { PLAYER_UNITS } from '../data/unitDefinitions';
import { ItemSlotSnapshot, UnitTabSnapshot } from '../battle/types';
import { Button } from '../ui/Button';
import { ContextMenu } from '../ui/ContextMenu';
import { UnitCampButton } from '../ui/UnitCampButton';
import { fontSize, VALUE_COLOR, BTN, SCENE_BG } from '../ui/theme';
import { ItemTooltip } from '../objects/ItemTooltip';
import { UnitTooltip } from '../objects/UnitTooltip';
import { EquipmentMatrix } from '../objects/EquipmentMatrix';
import { BackpackRow } from '../objects/BackpackRow';
import { EnemyGroupSelector } from '../objects/EnemyGroupSelector';

type EquipScreenPhase = Extract<ReturnType<typeof PhaseManager.getPhase>, { type: 'equip_screen' }>;
type DebugEquipScreenPhase = Extract<ReturnType<typeof PhaseManager.getPhase>, { type: 'debug_equip_screen' }>;
type AnyEquipPhase = EquipScreenPhase | DebugEquipScreenPhase;

const CELL_SIZE    = Math.round(56  * LAYOUT_SCALE);
const CELL_GAP     = Math.round(6   * LAYOUT_SCALE);
const PORTRAIT_TAB = Math.round(32  * LAYOUT_SCALE);
const PORTRAIT_SEL = Math.round(128 * LAYOUT_SCALE);
const SPRITE_SZ = Math.round(256 * LAYOUT_SCALE);
const PAD = Math.round(16 * LAYOUT_SCALE);

export class EquipScreen extends Phaser.Scene {
  private selectedTemplateId = "";
  private _selectorPanel: EnemyGroupSelector | null = null;
  private _selectionContainer: Phaser.GameObjects.Container | null = null;
  private equipMatrix?: EquipmentMatrix;
  private backpackRow?: BackpackRow;
  private statsPanel?: UnitTooltip;
  private skillsPanel?: UnitTooltip;
  private statsPanelX = 0;
  private statsPanelY = 0;
  private statsPanelW = 0;
  private skillsPanelX = 0;
  private skillsPanelW = 0;
  private itemTooltip!: ItemTooltip;
  private activeContextMenu: ContextMenu | null = null;

  constructor() {
    super({ key: "EquipScreen" });
  }

  create(): void {
    const phase = PhaseManager.getPhase() as AnyEquipPhase;
    this.selectedTemplateId = phase.selectedUnitTemplateId;

    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(w / 2, h / 2, w, h, SCENE_BG.default);

    this.itemTooltip = new ItemTooltip(this);

    if (!this.selectedTemplateId) {
      this.renderSelectionMode(phase);
    } else {
      this.renderCharacterMenu(phase as AnyEquipPhase);
    }

    EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  shutdown(): void {
    EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this);
    this._selectorPanel = null;
    this._selectionContainer = null;
  }

  destroy(): void {
    EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  // ── Mode A: unit selection ─────────────────────────────────────────────────

  private renderSelectionMode(phase: AnyEquipPhase): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const isDebug = phase.type === 'debug_equip_screen';

    // Destroy and recreate on refresh (e.g. after camp toggle)
    this._selectionContainer?.destroy();
    const c = this.add.container(0, 0);
    this._selectionContainer = c;

    const title = this.add
      .text(w / 2, Math.round(40 * LAYOUT_SCALE), isDebug ? "Debug — Select character" : "Select a character", {
        fontSize: fontSize("lg"),
        color: VALUE_COLOR.neutral,
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    c.add(title);

    const units = phase.availableUnits;
    const rows = [units.slice(0, 6), units.slice(6, 12)].filter(
      (r) => r.length > 0,
    );
    const startY = Math.round(100 * LAYOUT_SCALE);

    rows.forEach((row, ri) => {
      const rowY = startY + ri * (PORTRAIT_SEL + Math.round(28 * LAYOUT_SCALE));
      const totalW = row.length * (PORTRAIT_SEL + PAD) - PAD;
      const startX = (w - totalW) / 2;
      row.forEach((u, i) => {
        const px = startX + i * (PORTRAIT_SEL + PAD);
        this.addPortrait(px, rowY, PORTRAIT_SEL, u.templateId, u.name, c,
          () => PhaseManager.transition(
            isDebug
              ? { type: 'switch_debug_unit', templateId: u.templateId }
              : { type: 'switch_equip_unit', templateId: u.templateId },
          ),
        );

        if (isDebug) {
          const campIds = (phase as DebugEquipScreenPhase).campUnitIds;
          const inCamp = campIds.includes(u.templateId);
          const btn = new UnitCampButton(
            this,
            px + PORTRAIT_SEL / 2,
            rowY + PORTRAIT_SEL - Math.round(11 * LAYOUT_SCALE),
            inCamp,
            () => PhaseManager.transition({ type: 'toggle_debug_camp', templateId: u.templateId }),
          );
          c.add(btn);
        }
      });
    });

    if (isDebug) {
      this.renderGoToBattleButton(w, h, c);
    } else {
      this.renderBackButton(w, h - Math.round(16 * LAYOUT_SCALE));
    }
  }

  private renderGoToBattleButton(w: number, h: number, container: Phaser.GameObjects.Container): void {
    const phase = PhaseManager.getPhase() as DebugEquipScreenPhase;
    const activeCount = phase.availableUnits.filter(u => !phase.campUnitIds.includes(u.templateId)).length;
    const tooMany = activeCount > 9;

    const BTN_W = Math.round(160 * LAYOUT_SCALE);
    const BTN_H = Math.round(44 * LAYOUT_SCALE);
    const btnY = h - Math.round(36 * LAYOUT_SCALE);
    const btn = new Button({
      scene: this,
      x: w / 2,
      y: btnY,
      w: BTN_W,
      h: BTN_H,
      label: 'Go to Battle →',
      style: tooMany ? 'danger' : 'primary',
      onClick: () => {
        if (tooMany) return;
        if (this._selectorPanel) {
          this._selectorPanel.destroy();
          this._selectorPanel = null;
          return;
        }
        this._selectorPanel = new EnemyGroupSelector(this, w / 2 - 100, btnY - 190);
      },
    });
    container.add(btn);
  }

  private addPortrait(
    x: number,
    y: number,
    size: number,
    templateId: string,
    name: string,
    container: Phaser.GameObjects.Container | null,
    onClick: () => void,
  ): void {
    const spriteKey = `sprite-${templateId}`;
    const img = this.textures.exists(spriteKey)
      ? this.add.image(x + size / 2, y + size / 2, spriteKey).setDisplaySize(size, size).setInteractive({ useHandCursor: true }).on("pointerup", onClick)
      : this.add.rectangle(x + size / 2, y + size / 2, size, size, BTN.neutral.base).setInteractive({ useHandCursor: true }).on("pointerup", onClick);
    const label = this.add
      .text(x + size / 2, y + size + Math.round(4 * LAYOUT_SCALE), name, {
        fontSize: fontSize("sm"),
        color: VALUE_COLOR.neutral,
      })
      .setOrigin(0.5, 0);
    if (container) {
      container.add([img as Phaser.GameObjects.GameObject, label]);
    }
  }

  // ── Mode B: character menu ─────────────────────────────────────────────────

  private renderCharacterMenu(phase: AnyEquipPhase): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.renderUnitTabs(phase.availableUnits, w, phase.type === 'debug_equip_screen');

    const matrixW = 3 * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const matrixH = 4 * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const contentTopY = CELL_SIZE + PAD * 2;

    const STATS_W = Math.round(200 * LAYOUT_SCALE);
    const SKILLS_W = Math.round(200 * LAYOUT_SCALE);
    const totalContentW =
      STATS_W + PAD + matrixW + PAD + SPRITE_SZ + PAD + SKILLS_W;
    const startX = Math.round((w - totalContentW) / 2);
    const statsX = startX;
    const matrixX = startX + STATS_W + PAD;
    const spriteX = matrixX + matrixW + PAD;
    const skillsX = spriteX + SPRITE_SZ + PAD;
    this.statsPanelX = statsX;
    this.statsPanelY = contentTopY;
    this.statsPanelW = STATS_W;
    this.skillsPanelX = skillsX;
    this.skillsPanelW = SKILLS_W;

    // Stats panel (leftmost column)
    this.statsPanel = new UnitTooltip(this);

    // Equipment matrix (second column)
    this.equipMatrix = new EquipmentMatrix(
      this,
      matrixX,
      contentTopY,
      CELL_SIZE,
      CELL_GAP,
      phase.unitEquipment,
      this.itemTooltip,
      (slot, item) => this.onEquipSlotClick(slot, item),
    );

    // Unit sprite (third column)
    this.renderUnitSprite(phase.selectedUnitTemplateId, spriteX, contentTopY);

    // Skills panel (rightmost column)
    this.skillsPanel = new UnitTooltip(this);
    this.refreshPanels(phase);

    // Backpack (below the four columns)
    const backpackY = contentTopY + Math.max(matrixH, SPRITE_SZ) + PAD;
    const backpackW = 12 * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const backpackX = Math.round((w - backpackW) / 2);
    this.backpackRow = new BackpackRow(
      this,
      backpackX,
      backpackY,
      CELL_SIZE,
      CELL_GAP,
      phase.backpack,
      this.itemTooltip,
      (item, cellX, cellY) => this.onBackpackItemClick(item, cellX, cellY),
      12,
      2,
    );

    const backpackBottomY = backpackY + 2 * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    this.renderBackButton(w, backpackBottomY);
  }

  private renderUnitTabs(units: UnitTabSnapshot[], screenW: number, isDebug = false): void {
    const totalW = units.length * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const startX = Math.round((screenW - totalW) / 2);
    units.forEach((u, i) => {
      const tabX = startX + i * (CELL_SIZE + CELL_GAP);
      const isSelected = u.templateId === this.selectedTemplateId;
      const baseColor = isSelected ? BTN.navy.hover : BTN.navy.base;

      const spriteKey = `sprite-${u.templateId}`;
      if (this.textures.exists(spriteKey)) {
        const img = this.add
          .image(tabX + CELL_SIZE / 2, PAD + CELL_SIZE / 2, spriteKey)
          .setDisplaySize(CELL_SIZE, CELL_SIZE)
          .setTint(isSelected ? 0xffffff : 0xaaaaaa)
          .setInteractive({ useHandCursor: !isSelected });

        if (!isSelected) {
          img.on("pointerover", () => img.setTint(0xffffff));
          img.on("pointerout", () => img.setTint(0xaaaaaa));
          img.on("pointerup", () =>
            PhaseManager.transition(
              isDebug
                ? { type: 'switch_debug_unit', templateId: u.templateId }
                : { type: 'switch_equip_unit', templateId: u.templateId },
            ),
          );
        }
      } else {
        const rect = this.add
          .rectangle(
            tabX + CELL_SIZE / 2,
            PAD + CELL_SIZE / 2,
            CELL_SIZE,
            CELL_SIZE,
            baseColor,
          )
          .setInteractive({ useHandCursor: !isSelected });

        if (!isSelected) {
          rect.on("pointerover", () => rect.setFillStyle(BTN.navy.hover));
          rect.on("pointerout", () => rect.setFillStyle(BTN.navy.base));
          rect.on("pointerup", () =>
            PhaseManager.transition(
              isDebug
                ? { type: 'switch_debug_unit', templateId: u.templateId }
                : { type: 'switch_equip_unit', templateId: u.templateId },
            ),
          );
        }

        this.add
          .text(tabX + CELL_SIZE / 2, PAD + CELL_SIZE / 2, u.name.charAt(0), {
            fontSize: fontSize("sm"),
            color: VALUE_COLOR.neutral,
            fontStyle: "bold",
          })
          .setOrigin(0.5);
      }
    });
  }

  private renderUnitSprite(templateId: string, x: number, y: number): void {
    const spriteKey = `sprite-${templateId}`;
    if (this.textures.exists(spriteKey)) {
      this.add
        .image(x + SPRITE_SZ / 2, y + SPRITE_SZ / 2, spriteKey)
        .setDisplaySize(SPRITE_SZ, SPRITE_SZ)
        .setOrigin(0.5);
    } else {
      this.add.rectangle(
        x + SPRITE_SZ / 2,
        y + SPRITE_SZ / 2,
        SPRITE_SZ,
        SPRITE_SZ,
        0x4a4a6a,
      );
    }
  }

  private refreshPanels(phase: AnyEquipPhase): void {
    if (!phase.selectedUnitTemplateId || !phase.unitStats) return;
    const bp = PLAYER_UNITS.find(u => u.templateId === phase.selectedUnitTemplateId);
    if (!bp) return;
    const { level, equippedBonuses } = phase.unitStats;
    this.statsPanel?.showFixedStatsOnly(bp, level, equippedBonuses, this.statsPanelX, this.statsPanelY, this.statsPanelW);
    this.skillsPanel?.showFixedSkillsOnly(bp, level, this.skillsPanelX, this.statsPanelY, this.skillsPanelW);
  }

  private renderBackButton(w: number, backpackBottomY: number): void {
    const BTN_W = Math.round(44 * LAYOUT_SCALE);
    const BTN_H = Math.round(34 * LAYOUT_SCALE);
    new Button({
      scene: this,
      x: w - Math.round(16 * LAYOUT_SCALE) - BTN_W / 2,
      y: backpackBottomY - BTN_H / 2,
      w: BTN_W,
      h: BTN_H,
      label: "←",
      style: "neutral",
      onClick: () => PhaseManager.transition({ type: "close_equip_screen" }),
    });
  }

  // ── Item interaction ───────────────────────────────────────────────────────

  private onBackpackItemClick(
    item: ItemSlotSnapshot,
    cellX: number,
    cellY: number,
  ): void {
    this.dismissContextMenu();
    const def = item.definition;

    if (def.usage === "equip") {
      PhaseManager.transition({
        type: "equip_item",
        instanceId: item.instanceId,
        unitTemplateId: this.selectedTemplateId,
      });
      return;
    }

    const options: Array<{ label: string; onClick: () => void }> = [];

    if (def.usage === "equip_and_activate") {
      options.push({
        label: "Wear",
        onClick: () => {
          this.dismissContextMenu();
          PhaseManager.transition({
            type: "equip_item",
            instanceId: item.instanceId,
            unitTemplateId: this.selectedTemplateId,
          });
        },
      });
    }

    options.push({
      label: "Use",
      onClick: () => {
        this.dismissContextMenu();
        PhaseManager.transition({
          type: "use_item",
          instanceId: item.instanceId,
          unitTemplateId: this.selectedTemplateId,
        });
      },
    });

    this.activeContextMenu = new ContextMenu({
      scene: this,
      x: cellX,
      y: cellY,
      options,
      onDismiss: () => this.dismissContextMenu(),
    });
    this.add.existing(this.activeContextMenu);
  }

  private onEquipSlotClick(slot: string, item: ItemSlotSnapshot | null): void {
    if (item) {
      PhaseManager.transition({
        type: "unequip_item",
        unitTemplateId: this.selectedTemplateId,
        slot,
      });
    }
  }

  private dismissContextMenu(): void {
    this.activeContextMenu?.dismiss();
    this.activeContextMenu = null;
  }

  private onStateChanged(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'equip_screen' && phase.type !== 'debug_equip_screen') return;
    if (!phase.selectedUnitTemplateId) {
      this.renderSelectionMode(phase);
      return;
    }
    this.equipMatrix?.refresh(phase.unitEquipment);
    this.backpackRow?.refresh(phase.backpack);
    this.refreshPanels(phase);
  }
}
