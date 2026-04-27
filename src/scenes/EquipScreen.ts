import Phaser from 'phaser';
import { LAYOUT_SCALE } from '../core/Constants';
import { PhaseManager } from '../core/PhaseManager';
import { EventBus, Events } from '../core/EventBus';
import { GamePhase } from '../core/phases';
import { ItemSlotSnapshot } from '../battle/types';
import { ContextMenu } from '../ui/ContextMenu';
import { SCENE_BG } from '../ui/theme';
import { ItemTooltip } from '../objects/ItemTooltip';
import { EnemyGroupSelector } from '../objects/EnemyGroupSelector';
import { UnitTabRow } from '../objects/UnitTabRow';
import { UnitSelectionPanel } from '../objects/panels/UnitSelectionPanel';
import { EquipmentPanel } from '../objects/panels/EquipmentPanel';

export type EquipScreenPhase      = Extract<GamePhase, { type: 'equip_screen' }>;
export type DebugEquipScreenPhase = Extract<GamePhase, { type: 'debug_equip_screen' }>;
export type AnyEquipPhase         = EquipScreenPhase | DebugEquipScreenPhase;

const CELL_SIZE     = Math.round(56 * LAYOUT_SCALE);
const CELL_GAP      = Math.round(6  * LAYOUT_SCALE);
const PAD           = Math.round(16 * LAYOUT_SCALE);
const CONTENT_TOP_Y = CELL_SIZE + PAD * 2;

export class EquipScreen extends Phaser.Scene {
  private _selectionPanel : UnitSelectionPanel | null = null;
  private _tabRow          : UnitTabRow          | null = null;
  private _equipPanel      : EquipmentPanel      | null = null;
  private _selectorPanel   : EnemyGroupSelector  | null = null;
  private itemTooltip!     : ItemTooltip;
  private activeContextMenu: ContextMenu | null = null;

  constructor() {
    super({ key: 'EquipScreen' });
  }

  create(): void {
    const phase = PhaseManager.getPhase() as AnyEquipPhase;
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(w / 2, h / 2, w, h, SCENE_BG.default);
    this.itemTooltip = new ItemTooltip(this);

    if (!phase.selectedUnitTemplateId) {
      this.showSelectionMode(phase);
    } else {
      this.showCharacterMode(phase);
    }

    EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  shutdown(): void {
    EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this);
    this.clearPanels();
  }

  destroy(): void {
    EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  // ── Mode switching ─────────────────────────────────────────────────────────

  private showSelectionMode(phase: AnyEquipPhase): void {
    this.clearPanels();
    const w       = this.scale.width;
    const h       = this.scale.height;
    const isDebug = phase.type === 'debug_equip_screen';

    this._selectionPanel = new UnitSelectionPanel({
      scene:    this,
      screenW:  w,
      screenH:  h,
      phase,
      onSelectUnit: (templateId) => PhaseManager.transition(
        isDebug
          ? { type: 'switch_debug_unit', templateId }
          : { type: 'switch_equip_unit', templateId },
      ),
      onToggleCamp: isDebug
        ? (templateId) => PhaseManager.transition({ type: 'toggle_debug_camp', templateId })
        : undefined,
      onGoToBattle: isDebug ? () => this.openEnemySelector() : undefined,
      onBack: !isDebug ? () => PhaseManager.transition({ type: 'close_equip_screen' }) : undefined,
    });
  }

  private showCharacterMode(phase: AnyEquipPhase): void {
    this.clearPanels();
    const w       = this.scale.width;
    const isDebug = phase.type === 'debug_equip_screen';

    this._tabRow = new UnitTabRow({
      scene:              this,
      screenW:            w,
      y:                  PAD,
      cellSize:           CELL_SIZE,
      gap:                CELL_GAP,
      units:              phase.availableUnits,
      selectedTemplateId: phase.selectedUnitTemplateId,
      onSwitch: (templateId) => PhaseManager.transition(
        isDebug
          ? { type: 'switch_debug_unit', templateId }
          : { type: 'switch_equip_unit', templateId },
      ),
    });

    this._equipPanel = new EquipmentPanel({
      scene:               this,
      screenW:             w,
      contentTopY:         CONTENT_TOP_Y,
      phase,
      itemTooltip:         this.itemTooltip,
      onEquipSlotClick:    (slot, item) => this.onEquipSlotClick(slot, item),
      onBackpackItemClick: (item, cx, cy) => this.onBackpackItemClick(item, cx, cy),
      onUpgrade:           () => PhaseManager.transition({ type: 'open_upgrade_tree' }),
      onBack:              () => PhaseManager.transition({ type: 'close_equip_screen' }),
    });
  }

  private clearPanels(): void {
    this._selectionPanel?.destroy(); this._selectionPanel = null;
    this._tabRow?.destroy();         this._tabRow         = null;
    this._equipPanel?.destroy();     this._equipPanel     = null;
    this._selectorPanel?.destroy();  this._selectorPanel  = null;
  }

  // ── EnemyGroupSelector (debug only, lives in scene) ───────────────────────

  private openEnemySelector(): void {
    if (this._selectorPanel) {
      this._selectorPanel.destroy();
      this._selectorPanel = null;
      return;
    }
    const w    = this.scale.width;
    const h    = this.scale.height;
    const btnY = h - Math.round(36 * LAYOUT_SCALE);
    this._selectorPanel = new EnemyGroupSelector(
      this,
      w / 2 - 100,
      btnY - 190,
      (groupId) => PhaseManager.transition({ type: 'start_battle', enemyGroupId: groupId }),
    );
  }

  // ── Item interaction ───────────────────────────────────────────────────────

  private onBackpackItemClick(item: ItemSlotSnapshot, cellX: number, cellY: number): void {
    this.dismissContextMenu();
    const def = item.definition;

    if (def.usage === 'equip') {
      PhaseManager.transition({
        type: 'equip_item',
        instanceId: item.instanceId,
        unitTemplateId: this.getSelectedTemplateId(),
      });
      return;
    }

    const options: Array<{ label: string; onClick: () => void }> = [];

    if (def.usage === 'equip_and_activate') {
      options.push({
        label: 'Wear',
        onClick: () => {
          this.dismissContextMenu();
          PhaseManager.transition({
            type: 'equip_item',
            instanceId: item.instanceId,
            unitTemplateId: this.getSelectedTemplateId(),
          });
        },
      });
    }

    options.push({
      label: 'Use',
      onClick: () => {
        this.dismissContextMenu();
        PhaseManager.transition({
          type: 'use_item',
          instanceId: item.instanceId,
          unitTemplateId: this.getSelectedTemplateId(),
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
        type: 'unequip_item',
        unitTemplateId: this.getSelectedTemplateId(),
        slot,
      });
    }
  }

  private dismissContextMenu(): void {
    this.activeContextMenu?.dismiss();
    this.activeContextMenu = null;
  }

  private getSelectedTemplateId(): string {
    return (PhaseManager.getPhase() as AnyEquipPhase).selectedUnitTemplateId;
  }

  // ── State change handler ───────────────────────────────────────────────────

  private onStateChanged(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'equip_screen' && phase.type !== 'debug_equip_screen') return;

    if (!phase.selectedUnitTemplateId) {
      this.showSelectionMode(phase);
    } else {
      this._equipPanel?.refresh(phase);
    }
  }
}
