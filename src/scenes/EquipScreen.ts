import Phaser from 'phaser';
import { LAYOUT_SCALE } from '../core/Constants';
import { PhaseManager } from '../core/PhaseManager';
import { GamePhase, type PendingItemUsePrompt, type ItemActionMenuSnapshot } from '../core/phases';
import { bindStateChanged } from './sceneEvents';
import { backpackItemClickAction } from './backpackItemClickAction';
import { ItemSlotSnapshot } from '../battle/types';
import { UI_THEME } from '../ui/theme';
import { ItemTooltip } from '../objects/ItemTooltip';
import { EnemyGroupSelector } from '../objects/EnemyGroupSelector';
import { UnitTabRow } from '../objects/UnitTabRow';
import { UnitSelectionPanel } from '../objects/panels/UnitSelectionPanel';
import { EquipmentPanel } from '../objects/panels/EquipmentPanel';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { ItemActionDialog } from '../objects/ItemActionDialog';
import { formatItemUsePrompt } from '../objects/itemUseEffectPresentation';

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
   * Widget handles, never gameplay state. Which modal is open is decided entirely by the
   * committed phase (`phase.itemActionMenu` / `phase.pendingItemUsePrompt`), and those two
   * project one storage cell, so at most one can be non-null.
   */
  private _confirmDialog   : ConfirmationDialog  | null = null;
  private _itemActionDialog: ItemActionDialog    | null = null;
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

    this.syncModals(phase);

    bindStateChanged(this, this.onStateChanged, this);
  }

  shutdown(): void {
    this.clearPanels();
  }

  destroy(): void {
    this.syncConfirmDialog(null);
    this.syncItemActionDialog(null);
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
    this.syncItemActionDialog(null);
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
    // Input routing only: the resolver accepts or rejects, and the committed phase decides which
    // modal (if any) is rendered. There is no scene-side eligibility rule.
    PhaseManager.transition(backpackItemClickAction(item, this.getSelectedTemplateId()));
  }

  /**
   * Reconciles the dialog with the committed phase. Teardown-first and idempotent: the dialog
   * resolves by destroying itself BEFORE invoking a callback, so destroying it here can never
   * fire a consumption.
   */
  private syncConfirmDialog(prompt: PendingItemUsePrompt | null): void {
    this._confirmDialog?.destroy();
    this._confirmDialog = null;
    if (!prompt) return;

    this._confirmDialog = new ConfirmationDialog({
      scene: this,
      message: formatItemUsePrompt(prompt),
      confirmLabel: 'Use',
      onConfirm: () => PhaseManager.transition({
        type: 'confirm_use_item',
        instanceId: prompt.instanceId,
        unitTemplateId: prompt.unitTemplateId,
      }),
      onCancel: () => PhaseManager.transition({ type: 'cancel_use_item' }),
    });
  }

  /**
   * Reconciles the item-action window with the committed phase, on the same terms as the
   * confirmation above: teardown-first, idempotent, and destruction never fires a selection.
   */
  private syncItemActionDialog(menu: ItemActionMenuSnapshot | null): void {
    this._itemActionDialog?.destroy();
    this._itemActionDialog = null;
    if (!menu) return;

    this._itemActionDialog = new ItemActionDialog({
      scene: this,
      menu,
      onSelect: action => PhaseManager.transition({
        type: 'select_item_action',
        instanceId: menu.instanceId,
        action,
      }),
      onDismiss: () => PhaseManager.transition({ type: 'close_item_actions' }),
    });
  }

  /**
   * Both modals are reconciled together and in one place, because they project ONE storage
   * cell: rebuilding them independently could momentarily show both.
   */
  private syncModals(phase: AnyEquipPhase): void {
    this.syncItemActionDialog(phase.itemActionMenu);
    this.syncConfirmDialog(phase.pendingItemUsePrompt);
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
    this.syncModals(phase);
  }
}
