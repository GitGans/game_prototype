import {
  CELL_SIZE,
  CELL_GAP,
  BENCH_PANEL_WIDTH,
  BENCH_GAP,
  BENCH_SLOTS,
  LAYOUT_SCALE,
} from '../../core/Constants';
import { PhaseManager } from '../../core/PhaseManager';
import { cellKey } from '../../battle/field';
import { getOccupiedCells } from '../../battle/shapes';
import type { CellCoord, Side } from '../../battle/types';
import type { BattleUnitSnapshot, BenchUnitSnapshot } from '../../shared/battleSnapshots';
import type { GamePhase } from '../../core/phases';
import type { CellView } from '../../objects/CellView';
import type { UnitView } from '../../objects/UnitView';
import type { UnitTooltip } from '../../objects/UnitTooltip';
import { BenchCard, type BenchCardMode } from '../../objects/BenchCard';
import { Button } from '../../ui/Button';
import Phaser from 'phaser';

type BattlePhase = Extract<GamePhase, { type: 'battle' }>;

export class BattlePlacementController {
  private benchCards: BenchCard[] = [];
  private startBattleBtn: Button | null = null;
  private lastClickCoordKey: string | null = null;
  private lastClickTime = 0;
  private prevPlacementUnitsSignature: string | null = null;

  constructor(private readonly deps: {
    scene: Phaser.Scene;
    cellViews: Map<string, CellView>;
    unitViews: Map<string, UnitView>;
    unitTooltip: UnitTooltip;
    getLogBounds: () => { x: number; y: number; w: number; h: number };
    cellPixelPos: (side: Side, row: number, col: number) => { x: number; y: number };
    setStatus: (text: string) => void;
    setBattleLogVisible: (visible: boolean) => void;
    createUnitView: (unit: BattleUnitSnapshot) => void;
    destroyUnitView: (unitId: string) => void;
    onStartBattle: () => void;
  }) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  enterPlacementPhase(): void {
    this.prevPlacementUnitsSignature = null;
    this.lastClickCoordKey = null;
    this.lastClickTime = 0;
    this.destroyBenchCards();
    this.destroyStartBattleButton();
    this.deps.setStatus('Place your troops and click "Battle"');
    this.deps.setBattleLogVisible(false);
    this.buildBenchPanel(true);
    this.buildStartBattleButton();
  }

  handlePlacementPointerDown(coord: CellCoord): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'battle' || phase.battlePhase !== 'placement') return;
    if (coord.side !== 'player') return;

    const key = cellKey(coord);
    const now = Date.now();

    if (key === this.lastClickCoordKey && now - this.lastClickTime < 300) {
      const unitId = phase.occupancy.cellToUnitId.get(key);
      if (unitId) {
        PhaseManager.transition({ type: 'return_field_unit_to_bench', unitId });
      }
      this.lastClickCoordKey = null;
      this.lastClickTime = 0;
    } else {
      this.lastClickCoordKey = key;
      this.lastClickTime = now;
    }
  }

  handlePlacementCellClick(coord: CellCoord, phase: BattlePhase): void {
    if (coord.side !== 'player') return;
    const { selectedFieldUnitId } = phase.placementSelection;
    const selectedBenchSlot       = phase.selectedBenchSlot;
    const unitId = phase.occupancy.cellToUnitId.get(cellKey(coord));

    if (selectedBenchSlot !== null) {
      if (!unitId) {
        PhaseManager.transition({ type: 'place_bench_unit', benchIdx: selectedBenchSlot, anchor: coord });
      } else {
        PhaseManager.transition({ type: 'swap_bench_with_field', benchIdx: selectedBenchSlot, fieldUnitId: unitId });
      }
      return;
    }

    if (unitId) {
      if (selectedFieldUnitId === null) {
        PhaseManager.transition({ type: 'select_field_unit', unitId });
      } else if (selectedFieldUnitId === unitId) {
        PhaseManager.transition({ type: 'clear_placement_selection' });
      } else {
        PhaseManager.transition({ type: 'swap_field_units', unitAId: selectedFieldUnitId, unitBId: unitId });
      }
    } else if (selectedFieldUnitId !== null) {
      PhaseManager.transition({ type: 'move_field_unit', unitId: selectedFieldUnitId, anchor: coord });
    }
  }

  onPlacementStateChanged(phase: BattlePhase): void {
    const sig = this.buildPlacementUnitsSignature(phase);

    if (sig !== this.prevPlacementUnitsSignature) {
      this.reconcilePlacementUnitViews(phase);
      this.prevPlacementUnitsSignature = sig;
    }

    this.buildBenchPanel(true);
    this.applyPlacementHighlights(phase);
  }

  teardownForCombat(): void {
    this.buildBenchPanel(false);
    this.destroyStartBattleButton();
    this.clearPlacementHighlights();
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private buildBenchPanel(interactive: boolean): void {
    this.destroyBenchCards();

    const phase = PhaseManager.getPhase();
    if (phase.type !== 'battle') return;

    const cardH  = CELL_SIZE;
    const panelX = BENCH_GAP + BENCH_PANEL_WIDTH / 2;
    const mode: BenchCardMode = interactive ? 'placement' : 'battle';

    const gridTopY    = this.deps.cellPixelPos('player', 0, 2).y - CELL_SIZE / 2;
    const gridBottomY = this.deps.cellPixelPos('player', 0, 0).y + CELL_SIZE / 2;
    const totalH      = BENCH_SLOTS * cardH + (BENCH_SLOTS - 1) * CELL_GAP;
    const startY      = (gridTopY + gridBottomY) / 2 - totalH / 2 + cardH / 2;

    for (let i = 0; i < BENCH_SLOTS; i++) {
      const snapshot   = phase.benchUnits[i] ?? null;
      const cardY      = startY + i * (cardH + CELL_GAP);
      const isSelected = phase.selectedBenchSlot === i;

      const { x: logX, y: logY, w: logW } = this.deps.getLogBounds();

      // Build callbacks separately to avoid `...(false | object)` spread — TypeScript
      // cannot narrow that to an object type inside a spread expression.
      const callbacks =
        snapshot === null
          ? { onClick: () => this.onBenchCardClick(i) }
          : {
              onClick:      () => this.onBenchCardClick(i),
              onHoverStart: (snap: BenchUnitSnapshot) =>
                this.deps.unitTooltip.showBenchSnapshot(snap, logX, logY, logW),
              onHoverEnd:   () => this.deps.unitTooltip.hide(),
            };

      const card = new BenchCard({
        scene:    this.deps.scene,
        x:        panelX,
        y:        cardY,
        width:    BENCH_PANEL_WIDTH,
        height:   cardH,
        snapshot,
        selected: isSelected,
        mode,
        callbacks,
      });

      this.benchCards.push(card);
    }
  }

  private onBenchCardClick(idx: number): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'battle') return;
    const { selectedFieldUnitId } = phase.placementSelection;

    if (phase.benchUnits[idx] === null) {
      if (selectedFieldUnitId !== null) {
        PhaseManager.transition({ type: 'move_field_unit_to_bench', unitId: selectedFieldUnitId, benchIdx: idx });
      }
      return;
    }

    if (selectedFieldUnitId !== null) {
      PhaseManager.transition({ type: 'swap_bench_with_field', benchIdx: idx, fieldUnitId: selectedFieldUnitId });
      return;
    }

    if (phase.selectedBenchSlot === idx) {
      PhaseManager.transition({ type: 'clear_placement_selection' });
    } else {
      PhaseManager.transition({ type: 'select_bench_slot', benchIdx: idx });
    }
  }

  private buildStartBattleButton(): void {
    this.destroyStartBattleButton();

    const { x: logX, y: logY, w: logW, h: logH } = this.deps.getLogBounds();
    const btnW = Math.round(160 * LAYOUT_SCALE);
    const btnH = Math.round(100 * LAYOUT_SCALE);
    const btnX = logX + logW / 2;
    const btnY = logY + logH / 2;

    this.startBattleBtn = new Button({
      scene: this.deps.scene, x: btnX, y: btnY, w: btnW, h: btnH,
      label: "⚔\nBattle", style: "primary", fontKey: "xl",
      onClick: () => this.deps.onStartBattle(),
    });
  }

  private destroyStartBattleButton(): void {
    if (this.startBattleBtn) {
      this.startBattleBtn.destroy();
      this.startBattleBtn = null;
    }
  }

  private destroyBenchCards(): void {
    for (const card of this.benchCards) card.destroy();
    this.benchCards = [];
  }

  private buildPlacementUnitsSignature(phase: BattlePhase): string {
    return phase.units
      .filter(u => u.anchor.side === 'player')
      .map(u => `${u.id}:${u.anchor.row}:${u.anchor.col}`)
      .sort()
      .join(';');
  }

  private reconcilePlacementUnitViews(phase: BattlePhase): void {
    const playerUnitIds = new Set(
      phase.units.filter(u => u.anchor.side === 'player').map(u => u.id),
    );

    for (const [id] of [...this.deps.unitViews]) {
      const unit = phase.unitsById.get(id);
      if (!unit) {
        this.deps.destroyUnitView(id);
        continue;
      }
      if (unit.anchor.side === 'player' && !playerUnitIds.has(id)) {
        this.deps.destroyUnitView(id);
      }
    }

    for (const unit of phase.units) {
      if (unit.anchor.side === 'player' && !this.deps.unitViews.has(unit.id)) {
        this.deps.createUnitView(unit);
      }
    }

    for (const unit of phase.units) {
      if (unit.anchor.side === 'player') {
        this.deps.unitViews.get(unit.id)?.update(unit);
      }
    }
  }

  private applyPlacementHighlights(phase: BattlePhase): void {
    this.clearPlacementHighlights();
    const selectedId = phase.placementSelection.selectedFieldUnitId;
    if (!selectedId) return;
    const unit = phase.unitsById.get(selectedId);
    if (!unit) return;
    const cells = getOccupiedCells(unit.anchor, unit.shape);
    for (const coord of cells) {
      this.deps.cellViews.get(cellKey(coord))?.setHighlight('selected');
    }
  }

  private clearPlacementHighlights(): void {
    for (const [, cell] of this.deps.cellViews) {
      cell.setHighlight('none');
    }
  }
}
