import Phaser from 'phaser';
import { ModalFrame, modalContentWidth } from '../ui/ModalFrame';
import { UI_THEME, fontSize } from '../ui/theme';
import { rowItemCenterX } from '../ui/layout';
import { UnitPortrait } from './UnitPortrait';
import { ITEM_VISUAL_THEME } from './itemVisualTheme';
import { formatResurrectionTargetPrompt } from './itemUseEffectPresentation';
import type {
  PendingResurrectionTargetSelection, ResurrectionTargetOption,
} from '../core/phases';

/**
 * Picks which dead party member a resurrection scroll raises.
 *
 * Built on `ui/ModalFrame`, which keeps the scrim, the panel, the close icon, the footer row,
 * Escape handling and one-shot teardown — none of that is re-rolled here. The dialog owns only its
 * heading, the item name and the card grid.
 *
 * Selecting a card resolves through `ModalFrame.resolve()`, so teardown happens BEFORE the action
 * dispatches and overlapping input can submit at most once. Every dismissal route means "nothing
 * was used" and lands on `onCancel`.
 *
 * It renders the targets it is given and decides nothing: eligibility, ordering and the percentage
 * are all committed `GamePhase` data.
 */

const MODAL = UI_THEME.component.modal;
const GRID  = MODAL.targetGrid;
/** A composition of theme tokens, not a new dimension. */
const CARD_H = GRID.portraitSize + GRID.labelGap + GRID.labelLineH * GRID.labelLines;

export interface ResurrectionTargetDialogConfig {
  scene: Phaser.Scene;
  selection: PendingResurrectionTargetSelection;
  /** A card was clicked. Fires at most once, after the frame has torn itself down. */
  onSelectTarget: (targetTemplateId: string) => void;
  /** Backdrop, close icon, Cancel and Escape all land here — nothing is consumed. */
  onCancel: () => void;
}

export class ResurrectionTargetDialog {
  private readonly frame: ModalFrame;

  constructor(cfg: ResurrectionTargetDialogConfig) {
    const { scene, selection } = cfg;
    const count   = selection.targets.length;
    const columns = Math.min(count, GRID.maxColumns);
    const rows    = Math.ceil(count / GRID.maxColumns);

    // Width follows the ACTUAL column count, card widths, gaps and modal padding.
    const gridW = columns * GRID.cardW + (columns - 1) * GRID.colGap;
    const width = Math.max(MODAL.defaultWidth, gridW + MODAL.pad * 2);
    const wrapW = modalContentWidth(width);

    // Both texts are measured BEFORE the frame is built: the frame needs a final content height,
    // and wrapping is what decides it.
    const heading = scene.add.text(0, 0, formatResurrectionTargetPrompt(selection), {
      fontSize:  fontSize('md'),
      color:     UI_THEME.color.value.white,
      fontStyle: 'bold',
      align:     'center',
      wordWrap:  { width: wrapW },
    }).setOrigin(0.5);

    const itemName = scene.add.text(0, 0, selection.itemName, {
      fontSize: fontSize('sm'),
      color:    UI_THEME.color.value.neutral,
      align:    'center',
      wordWrap: { width: wrapW },
    }).setOrigin(0.5);

    const gridH = rows * CARD_H + (rows - 1) * GRID.rowGap;
    const contentHeight =
      heading.height + GRID.textGap + itemName.height + GRID.textGap + gridH;

    this.frame = new ModalFrame({
      scene,
      width,
      contentHeight,
      dismiss: {
        backdrop:  true,
        closeIcon: true,
        button:    { label: 'Cancel', style: 'neutral' },
        escape:    true,
      },
      onDismiss: () => cfg.onCancel(),
    });

    const top = this.frame.contentCenterY - contentHeight / 2;
    heading
      .setPosition(this.frame.contentCenterX, top + heading.height / 2)
      .setDepth(this.frame.contentDepth);
    itemName
      .setPosition(
        this.frame.contentCenterX,
        top + heading.height + GRID.textGap + itemName.height / 2,
      )
      .setDepth(this.frame.contentDepth);
    this.frame.add(heading, itemName);

    const gridTop = top + heading.height + GRID.textGap + itemName.height + GRID.textGap;
    selection.targets.forEach((target, index) => {
      const row      = Math.floor(index / GRID.maxColumns);
      const inRow    = index % GRID.maxColumns;
      const rowCount = Math.min(count - row * GRID.maxColumns, GRID.maxColumns);
      // Each row is centred on its own count, so a trailing partial row sits under the middle of
      // the full one above it.
      const cx = rowItemCenterX(this.frame.contentCenterX, GRID.cardW, GRID.colGap, rowCount, inRow);
      const cy = gridTop + row * (CARD_H + GRID.rowGap) + CARD_H / 2;
      this.addCard(scene, target, cx, cy, cfg.onSelectTarget);
    });
  }

  /**
   * One card, ONE click handler — on the card background, which covers the whole card. The portrait
   * is decorative here (no `onClick` of its own), so two overlapping handlers can never both submit
   * the selection.
   */
  private addCard(
    scene: Phaser.Scene,
    target: ResurrectionTargetOption,
    cx: number,
    cy: number,
    onSelectTarget: (templateId: string) => void,
  ): void {
    const card = scene.add
      .rectangle(cx, cy, GRID.cardW, CARD_H, ITEM_VISUAL_THEME.cell.bg)
      .setDepth(this.frame.contentDepth)
      .setInteractive({ useHandCursor: true });

    card.on('pointerover', () =>
      card.setStrokeStyle(GRID.cardBorderWidth, ITEM_VISUAL_THEME.cell.hoverBorder));
    card.on('pointerout', () => card.setStrokeStyle());
    // Teardown first, then dispatch — the frame's one-shot guard makes a double click harmless.
    card.on('pointerup', () => this.frame.resolve(() => onSelectTarget(target.templateId)));

    const portrait = new UnitPortrait({
      scene,
      x: cx - GRID.portraitSize / 2,
      y: cy - CARD_H / 2,
      size: GRID.portraitSize,
      // A missing texture falls back to the portrait's own letter tile — never a crash.
      spriteKey: target.spriteKey,
      name: target.name,
    });
    scene.add.existing(portrait);
    portrait.setDepth(this.frame.contentDepth);

    const labelBand = GRID.labelLineH * GRID.labelLines;
    const label = scene.add.text(cx, cy + CARD_H / 2 - labelBand / 2, target.name, {
      fontSize: fontSize('xs'),
      color:    UI_THEME.color.value.neutral,
      align:    'center',
      wordWrap: { width: GRID.cardW - GRID.labelGap * 2 },
    }).setOrigin(0.5).setDepth(this.frame.contentDepth);

    // Everything caller-owned is registered, so the frame destroys it on every exit path.
    this.frame.add(card, portrait, label);
  }

  /** Silent teardown for scene reconciliation — invokes no callback. */
  destroy(): void {
    this.frame.destroy();
  }
}
