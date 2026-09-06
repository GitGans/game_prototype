import Phaser from 'phaser';
import { LAYOUT_SCALE } from '../core/Constants';
import { PhaseManager } from '../core/PhaseManager';
import { GamePhase, type PendingConsumePrompt } from '../core/phases';
import { bindStateChanged } from './sceneEvents';
import { ItemSlotSnapshot } from '../battle/types';
import { UI_THEME } from '../ui/theme';
import { ItemTooltip } from '../objects/ItemTooltip';
import { EnemyGroupSelector } from '../objects/EnemyGroupSelector';
import { UnitTabRow } from '../objects/UnitTabRow';
import { UnitSelectionPanel } from '../objects/panels/UnitSelectionPanel';
import { EquipmentPanel } from '../objects/panels/EquipmentPanel';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { formatConsumePrompt } from '../objects/itemUseEffectPresentation';

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
  /**
   * The only new scene-local state: a widget handle, never gameplay state. Whether a
   * confirmation is open is decided entirely by `phase.pendingConsumePrompt`.
   */
  private _confirmDialog   : ConfirmationDialog  | null = null;
  private itemTooltip!     : ItemTooltip;

  constructor() {
    super({ key: 'EquipScreen' });
  }

  create(): void {
    const phase = PhaseManager.getPhase() as AnyEquipPhase;
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(w / 2, h / 2, w, h, UI_THEME.color.background.default);
    this.itemTooltip = new ItemTooltip(this);

    if (!phase.selectedUnitTemplateId) {
      this.showSelectionMode(phase);
    } else {
      this.showCharacterMode(phase);
    }

    this.syncConfirmDialog(phase.pendingConsumePrompt);

    bindStateChanged(this, this.onStateChanged, this);
  }

  shutdown(): void {
    this.clearPanels();
  }

  destroy(): void {
    this.syncConfirmDialog(null);
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
        ? (templateId) => PhaseManager.transition({ type: 'toggle_camp_unit', templateId })
        : undefined,
      onGoToBattle: isDebug ? () => this.openEnemySelector() : undefined,
      onBack: () => PhaseManager.transition(
        isDebug
          ? { type: 'return_to_debug_level_select' }
          : { type: 'close_equip_screen' },
      ),
      onResetDebugSession: isDebug
        ? () => PhaseManager.transition({ type: 'reset_debug_session' })
        : undefined,
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
      onBackpackItemClick: (item) => this.onBackpackItemClick(item),
      onUpgrade:           () => PhaseManager.transition({ type: 'open_upgrade_tree' }),
      onBack:              () => PhaseManager.transition({ type: 'close_equip_screen' }),
    });
  }

  private clearPanels(): void {
    this._selectionPanel?.destroy(); this._selectionPanel = null;
    this._tabRow?.destroy();         this._tabRow         = null;
    this._equipPanel?.destroy();     this._equipPanel     = null;
    this._selectorPanel?.destroy();  this._selectorPanel  = null;
    this.syncConfirmDialog(null);
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

  private onBackpackItemClick(item: ItemSlotSnapshot): void {
    const { metadata } = item;
    // equipment + usable both equip; usable resolves to usable_slot via metadata.slot.
    if (metadata.kind === 'equipment' || metadata.kind === 'usable') {
      PhaseManager.transition({
        type: 'equip_item',
        instanceId: item.instanceId,
        unitTemplateId: this.getSelectedTemplateId(),
      });
      return;
    }
    // consumable: request confirmation. The resolver rejects ineligible items, so an
    // unusable consumable simply does nothing here — no scene-side eligibility rule.
    if (metadata.kind === 'consumable') {
      PhaseManager.transition({ type: 'request_consume_item', instanceId: item.instanceId });
    }
  }

  /**
   * Reconciles the dialog with the committed phase. Teardown-first and idempotent: the dialog
   * resolves by destroying itself BEFORE invoking a callback, so destroying it here can never
   * fire a consumption.
   */
  private syncConfirmDialog(prompt: PendingConsumePrompt | null): void {
    this._confirmDialog?.destroy();
    this._confirmDialog = null;
    if (!prompt) return;

    this._confirmDialog = new ConfirmationDialog({
      scene: this,
      message: formatConsumePrompt(prompt),
      confirmLabel: 'Use',
      onConfirm: () => PhaseManager.transition({
        type: 'confirm_consume_item',
        instanceId: prompt.instanceId,
        unitTemplateId: prompt.unitTemplateId,
      }),
      onCancel: () => PhaseManager.transition({ type: 'cancel_consume_item' }),
    });
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
    this.syncConfirmDialog(phase.pendingConsumePrompt);
  }
}
