import Phaser from 'phaser';
import type { ItemActionKind, ItemActionMenuSnapshot } from '../shared/snapshotTypes';
import { ActionDialog } from '../ui/ActionDialog';
import {
  buildItemActionOptions, formatItemActionTitle, formatItemActionBody,
} from './itemActionPresentation';

/**
 * The item-aware adapter over the generic `ui/ActionDialog`: it takes structured snapshot data,
 * formats it through `itemActionPresentation`, and supplies callbacks.
 *
 * It contains no item rule and no healing-potion branch — every enabled flag arrives already
 * decided in the snapshot. It imports neither PhaseManager, storage, nor any executor: selecting
 * an action calls back to the scene, which dispatches.
 */
export interface ItemActionDialogConfig {
  scene: Phaser.Scene;
  menu: ItemActionMenuSnapshot;
  onSelect: (action: ItemActionKind) => void;
  onDismiss: () => void;
}

export class ItemActionDialog {
  private readonly dialog: ActionDialog;

  constructor(cfg: ItemActionDialogConfig) {
    this.dialog = new ActionDialog({
      scene: cfg.scene,
      title: formatItemActionTitle(cfg.menu),
      body: formatItemActionBody(cfg.menu),
      actions: buildItemActionOptions(cfg.menu).map(option => ({
        id: option.action,
        label: option.label,
        enabled: option.enabled,
        disabledExplanation: option.disabledExplanation,
        onSelect: () => cfg.onSelect(option.action),
      })),
      onDismiss: cfg.onDismiss,
    });
  }

  /** Safe to call multiple times; only the first call has any effect. Invokes no callback. */
  destroy(): void {
    this.dialog.destroy();
  }
}
