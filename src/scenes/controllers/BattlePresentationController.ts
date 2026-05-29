import Phaser from 'phaser';
import { LAYOUT_SCALE } from '../../core/Constants';
import { BATTLE_VISUAL_THEME } from '../../objects/battleVisualTheme';
import { cellKey } from '../../battle/field';
import type { CellCoord, Side, Unit } from '../../battle/types';
import type { BattleEvent } from '../../battle/battleEvents';
import type { BattleUnitSnapshot } from '../../shared/battleSnapshots';
import type { CellView } from '../../objects/CellView';
import type { UnitView } from '../../objects/UnitView';
import type { BattleLog } from '../../objects/BattleLog';
import type { GamePhase } from '../../core/phases';
import {
  buildBattleEventPresentations,
  type BattleEventPresentation,
} from '../../objects/battleEventPresentation';
import {
  buildBattleSkillPreviewPresentation,
  type BattleSkillPreviewHeaderColorKind,
} from '../../objects/battleSkillPreviewPresentation';
import { buildBattlePhaseSkillPreviewModel } from '../../core/battleSkillPreviewProjection';
import { buildBattleDirectivePresentation } from '../../objects/battleDirectivePresentation';
import type { BattleDirectivePresentationInput } from '../../shared/battleDirectivePresentationModel';

type BattlePhase = Extract<GamePhase, { type: 'battle' }>;

export class BattlePresentationController {
  constructor(private readonly deps: {
    scene: Phaser.Scene;
    cellViews: Map<string, CellView>;
    unitViews: Map<string, UnitView>;
    battleLog: BattleLog;
    statusText: Phaser.GameObjects.Text;
    statusHeaderText: Phaser.GameObjects.Text;
    getStatusBaseY: () => number;
    setStatus: (text: string) => void;
    refreshCells: (phase: BattlePhase) => void;
  }) {}

  // ─── Battle Event Presentation ───────────────────────────────────────────────

  presentBattleEvents(
    events: BattleEvent[],
    activeUnitOrSide: BattleUnitSnapshot | Unit | Side | null | undefined,
  ): void {
    const activeUnitSide =
      typeof activeUnitOrSide === 'string'
        ? activeUnitOrSide
        : activeUnitOrSide?.side ?? null;

    const presentations = buildBattleEventPresentations(events, { activeUnitSide });

    for (const presentation of presentations) {
      this.applyBattleEventPresentation(presentation);
    }
  }

  private applyBattleEventPresentation(presentation: BattleEventPresentation): void {
    if (presentation.floatingText) {
      const { unitId, kind, amount } = presentation.floatingText;
      const view = this.deps.unitViews.get(unitId);

      // If the unit view is gone (dead unit, mid-animation), skip silently.
      if (view) {
        if (kind === 'heal') {
          this.showFloatingHeal(view.x, view.y, amount);
        } else {
          this.showFloatingDamage(view.x, view.y, amount);
        }
      }
    }

    if (presentation.logEntry) {
      this.deps.battleLog.addEntry(
        presentation.logEntry.text,
        presentation.logEntry.type,
      );
    }
  }

  // ─── Floating Text ───────────────────────────────────────────────────────────

  private showFloatingDamage(x: number, y: number, amount: number): void {
    const text = this.deps.scene.add
      .text(x, y, `-${amount}`, {
        fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
        color: BATTLE_VISUAL_THEME.floatingText.damage,
        fontStyle: 'bold',
        stroke: BATTLE_VISUAL_THEME.floatingText.stroke,
        strokeThickness: Math.round(3 * LAYOUT_SCALE),
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.deps.scene.tweens.add({
      targets: text,
      y: y - Math.round(55 * LAYOUT_SCALE),
      alpha: 0,
      duration: 900,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  private showFloatingHeal(x: number, y: number, amount: number): void {
    const text = this.deps.scene.add
      .text(x, y, `+${amount}`, {
        fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
        color: BATTLE_VISUAL_THEME.floatingText.heal,
        fontStyle: 'bold',
        stroke: BATTLE_VISUAL_THEME.floatingText.stroke,
        strokeThickness: Math.round(3 * LAYOUT_SCALE),
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.deps.scene.tweens.add({
      targets: text,
      y: y - Math.round(55 * LAYOUT_SCALE),
      alpha: 0,
      duration: 900,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  // ─── Skill Preview ────────────────────────────────────────────────────────────

  applySkillPreview(phase: BattlePhase, coord: CellCoord): void {
    const model = buildBattlePhaseSkillPreviewModel({ phase, targetCoord: coord });
    if (!model) return;

    const presentation = buildBattleSkillPreviewPresentation(model);

    this.deps.refreshCells(phase);

    for (const cell of presentation.cells) {
      const view = this.deps.cellViews.get(cellKey(cell.coord));
      if (!view) continue;

      if (cell.kind === 'skill') {
        view.setSkillPreview(cell.multiplier, cell.highlight === 'heal');
      } else {
        view.setEffectPreview(cell.highlight === 'heal');
      }
    }

    this.deps.setStatus(presentation.statusBody);

    const baseY = this.deps.getStatusBaseY();
    const lineH = Math.round(14 * LAYOUT_SCALE);

    this.deps.statusHeaderText
      .setColor(this.skillPreviewHeaderColor(presentation.statusHeader.colorKind))
      .setText(presentation.statusHeader.text)
      .setY(baseY)
      .setVisible(true);

    this.deps.statusText.setY(baseY + lineH);
  }

  private skillPreviewHeaderColor(kind: BattleSkillPreviewHeaderColorKind): string {
    switch (kind) {
      case 'magical':  return BATTLE_VISUAL_THEME.skill.magical;
      case 'physical': return BATTLE_VISUAL_THEME.skill.physical;
      case 'neutral':  return BATTLE_VISUAL_THEME.unit.textLight;
    }
  }

  // ─── Directive Presentation ───────────────────────────────────────────────────

  applyDirectivePresentation(
    input: BattleDirectivePresentationInput,
  ): { displaySkillBar: boolean } {
    const presentation = buildBattleDirectivePresentation(input);

    if (presentation.statusText) {
      this.deps.setStatus(presentation.statusText);
    }

    return { displaySkillBar: presentation.displaySkillBar === true };
  }
}
