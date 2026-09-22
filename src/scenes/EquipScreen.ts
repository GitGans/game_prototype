import Phaser from 'phaser';
import { LAYOUT_SCALE } from '../core/Constants';
import { PhaseManager } from '../core/PhaseManager';
import { GamePhase, type PendingItemInteraction } from '../core/phases';
import { bindStateChanged } from './sceneEvents';
import {
  backpackItemClickAction, backpackItemUseAction,
  equippedItemClickAction, equippedItemUseAction,
} from './itemGestureActions';
import { ItemSlotSnapshot } from '../battle/types';
import { UI_THEME } from '../ui/theme';
import { ItemTooltip } from '../objects/ItemTooltip';
import { EnemyGroupSelector } from '../objects/EnemyGroupSelector';
import { UnitTabRow } from '../objects/UnitTabRow';
import { UnitSelectionPanel } from '../objects/panels/UnitSelectionPanel';
import { EquipmentPanel } from '../objects/panels/EquipmentPanel';
import { ConfirmationDialog } from '../ui/ConfirmationDialog';
import { ResurrectionTargetDialog } from '../objects/ResurrectionTargetDialog';
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
   * Widget handles, never gameplay state. WHICH modal is open — if any — is decided entirely by the
   * committed phase (`phase.pendingItemInteraction`). Neither handle stores a selection, a target
   * list, an origin or a percentage.
   */
  private _confirmDialog   : ConfirmationDialog       | null = null;
  private _reviveDialog    : ResurrectionTargetDialog | null = null;
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

    this.syncModals(phase.pendingItemInteraction);

    bindStateChanged(this, this.onStateChanged, this);
  }

  shutdown(): void {
    this.clearPanels();
  }

  destroy(): void {
    this.syncModals(null);
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
      onEquipSlotClick:          (slot, item) => this.onEquipSlotClick(slot, item),
      onEquipSlotDoubleClick:    (slot, item) => this.onEquipSlotDoubleClick(slot, item),
      onBackpackItemClick:       (item) => this.onBackpackItemClick(item),
      onBackpackItemDoubleClick: (item) => this.onBackpackItemDoubleClick(item),
      onUpgrade:           () => PhaseManager.transition({ type: 'open_upgrade_tree' }),
      onBack:              () => PhaseManager.transition({ type: 'close_equip_screen' }),
    });
  }

  private clearPanels(): void {
    this._selectionPanel?.destroy(); this._selectionPanel = null;
    this._tabRow?.destroy();         this._tabRow         = null;
    this._equipPanel?.destroy();     this._equipPanel     = null;
    this._selectorPanel?.destroy();  this._selectorPanel  = null;
    this.syncModals(null);
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

  // Input routing only: every gesture is mapped by `itemGestureActions`, the resolver accepts or
  // rejects it, and the committed phase decides whether a confirmation is rendered. There is no
  // scene-side eligibility rule and no branch here.

  private onBackpackItemClick(item: ItemSlotSnapshot): void {
    PhaseManager.transition(backpackItemClickAction(item, this.getSelectedTemplateId()));
  }

  private onBackpackItemDoubleClick(item: ItemSlotSnapshot): void {
    PhaseManager.transition(backpackItemUseAction(item));
  }

  /**
   * Reconciles the open modal with the committed phase — the one function that reads which modal
   * belongs on screen.
   *
   * Teardown-first and idempotent: both dialogs resolve by destroying themselves BEFORE invoking a
   * callback, so destroying one here can never fire a use or a selection. The item tooltip is
   * hidden before a modal opens because it renders at a higher depth and would sit over the panel.
   */
  private syncModals(interaction: PendingItemInteraction | null): void {
    this._confirmDialog?.destroy();
    this._confirmDialog = null;
    this._reviveDialog?.destroy();
    this._reviveDialog = null;
    if (!interaction) return;

    this.itemTooltip.hide();

    if (interaction.kind === 'confirming_use') {
      const { prompt } = interaction;
      this._confirmDialog = new ConfirmationDialog({
        scene: this,
        message: formatItemUsePrompt(prompt),
        confirmLabel: 'Use',
        dismiss: {
          backdrop:  true,
          closeIcon: true,
          button:    { label: 'Cancel', style: 'neutral' },
          escape:    true,
        },
        onConfirm: () => PhaseManager.transition({
          type: 'confirm_use_item',
          instanceId: prompt.instanceId,
          unitTemplateId: prompt.unitTemplateId,
        }),
        onCancel: () => PhaseManager.transition({ type: 'cancel_use_item' }),
      });
      return;
    }

    const { selection } = interaction;
    this._reviveDialog = new ResurrectionTargetDialog({
      scene: this,
      selection,
      // One click resurrects: there is no second confirmation step, even for a single target.
      onSelectTarget: (targetUnitTemplateId) => PhaseManager.transition({
        type: 'select_item_revive_target',
        instanceId: selection.instanceId,
        targetUnitTemplateId,
      }),
      onCancel: () => PhaseManager.transition({ type: 'cancel_use_item' }),
    });
  }

  private onEquipSlotClick(slot: string, item: ItemSlotSnapshot | null): void {
    // An empty slot has nothing to unequip; the resolver would reject it, but there is no gesture to
    // express either.
    if (item) {
      PhaseManager.transition(equippedItemClickAction(slot, this.getSelectedTemplateId()));
    }
  }

  private onEquipSlotDoubleClick(_slot: string, item: ItemSlotSnapshot): void {
    PhaseManager.transition(equippedItemUseAction(item));
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
    this.syncModals(phase.pendingItemInteraction);
  }
}
