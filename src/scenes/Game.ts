import Phaser from "phaser";
import {
  CELL_SIZE,
  CELL_GAP,
  GRID_COLS,
  GRID_ROWS,
  SIDE_GAP,
  LAYOUT_SCALE,
} from "../core/Constants";
import { EventBus, Events } from "../core/EventBus";
import { CellView } from "../objects/CellView";
import { UnitView } from "../objects/UnitView";
import { InitiativeBar } from "../objects/InitiativeBar";
import { BattleLog } from "../objects/BattleLog";
import { UnitTooltip } from "../objects/UnitTooltip";
import { EffectTooltip } from "../objects/EffectTooltip";
import { UI_THEME } from "../ui/theme";
import {
  CellCoord,
  Side,
  SpriteState,
} from "../battle/types";
import type { BattleUnitSnapshot, FieldBattleUnitSnapshot } from "../shared/battleSnapshots";
import { PhaseManager } from '../core/PhaseManager';
import { SkillTooltip } from '../objects/SkillTooltip';
import { SkillBar } from '../objects/SkillBar';
import { BattleEndOverlay, BattleEndOutcome } from '../objects/BattleEndOverlay';
import { cellKey } from "../battle/field";
import { getOccupiedCells } from "../battle/shapes";
import { BATTLE_VISUAL_THEME } from "../objects/battleVisualTheme";
import { BattlePresentationController } from './controllers/BattlePresentationController';
import { BattlePlacementController } from './controllers/BattlePlacementController';
import { BattleTurnFlowController } from './controllers/BattleTurnFlowController';

type BattlePhase = Extract<import('../core/phases').GamePhase, { type: 'battle' }>;

export class Game extends Phaser.Scene {
  private cellViews: Map<string, CellView> = new Map();
  private unitViews: Map<string, UnitView> = new Map();
  private initiativeBar!: InitiativeBar;
  private statusText!: Phaser.GameObjects.Text;
  private statusBaseY!: number;
  private statusHeaderText!: Phaser.GameObjects.Text;
  private battleLog!: BattleLog;
  private unitTooltip!: UnitTooltip;
  private effectTooltip!: EffectTooltip;
  private logX = 0;
  private logY = 0;
  private logW = 0;
  private logH = 0;

  private skillBar!: SkillBar;

  private battlePresentation!: BattlePresentationController;
  private battlePlacement!: BattlePlacementController;
  private battleTurnFlow!: BattleTurnFlowController;

  private cleanedUp = false;

  constructor() {
    super("Game");
  }

  create(): void {
    this.cleanedUp = false;
    this.unitViews.clear();

    this.buildGrid();
    this.unitTooltip = new UnitTooltip(this, UI_THEME.component.tooltip.bg, UI_THEME.component.tooltip.bgAlpha);
    this.effectTooltip = new EffectTooltip(this);
    this.skillBar = new SkillBar(this, new SkillTooltip(this));

    const initialPhase = PhaseManager.getPhase();
    if (initialPhase.type === 'battle') this.syncUnitViews(initialPhase);

    this.buildUI();

    this.battlePresentation = new BattlePresentationController({
      scene: this,
      cellViews: this.cellViews,
      unitViews: this.unitViews,
      battleLog: this.battleLog,
      statusText: this.statusText,
      statusHeaderText: this.statusHeaderText,
      getStatusBaseY: () => this.statusBaseY,
      setStatus: text => this.setStatus(text),
      refreshCells: phase => this.refreshCells(phase),
    });

    this.battlePlacement = new BattlePlacementController({
      scene: this,
      cellViews: this.cellViews,
      unitTooltip: this.unitTooltip,
      getLogBounds: () => ({ x: this.logX, y: this.logY, w: this.logW, h: this.logH }),
      cellPixelPos: (side, row, col) => this.cellPixelPos(side, row, col),
      setStatus: text => this.setStatus(text),
      setBattleLogVisible: visible => this.battleLog.setVisible(visible),
      onStartBattle: () => this.startBattle(),
    });

    this.battleTurnFlow = new BattleTurnFlowController({
      scene: this,
      cellViews: this.cellViews,
      unitViews: this.unitViews,
      skillBar: this.skillBar,
      battlePresentation: this.battlePresentation,
      setStatus: text => this.setStatus(text),
      refreshCells: phase => this.refreshCells(phase),
      showGameOver: side => this.showGameOver(side),
      setBattleLogVisible: visible => this.battleLog.setVisible(visible),
      cellPixelPos: (side, row, col) => this.cellPixelPos(side, row, col),
      detachStateChangedListener: () =>
        EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this),
      attachStateChangedListener: () =>
        EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this),
    });

    this.setupInput();
    this.battlePlacement.enterPlacementPhase();

    EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY,  this.cleanup, this);
  }

  private cleanup(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.battleTurnFlow?.destroy();
    EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  shutdown(): void {
    this.cleanup();
  }

  // ─── Grid Layout ───────────────────────────────────────────────────────────

  private cellPixelPos(
    side: Side,
    row: number,
    col: number,
  ): { x: number; y: number } {
    const totalGridW = GRID_ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const totalGridH = GRID_COLS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const canvasW = this.scale.width;
    const canvasH = this.scale.height;

    const leftGridX = canvasW / 2 - SIDE_GAP / 2 - totalGridW;
    const rightGridX = canvasW / 2 + SIDE_GAP / 2;
    const gridY = (canvasH - totalGridH) / 2 + Math.round(50 * LAYOUT_SCALE);

    const rowOffset =
      side === "player"
        ? (GRID_ROWS - 1 - row) * (CELL_SIZE + CELL_GAP)
        : row * (CELL_SIZE + CELL_GAP);

    const gridX = side === "player" ? leftGridX : rightGridX;
    const x = gridX + rowOffset + CELL_SIZE / 2;
    const y =
      gridY + (GRID_COLS - 1 - col) * (CELL_SIZE + CELL_GAP) + CELL_SIZE / 2;
    return { x, y };
  }

  private buildGrid(): void {
    for (const side of ["player", "enemy"] as Side[]) {
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const coord: CellCoord = {
            side,
            row: row as 0 | 1,
            col: col as 0 | 1 | 2,
          };
          const { x, y } = this.cellPixelPos(side, row, col);
          const cell = new CellView(this, x, y, coord);
          this.cellViews.set(cellKey(coord), cell);
        }
      }
    }

  }

  // ─── Unit Views ────────────────────────────────────────────────────────────

  private getUnitViewGeometry(unit: FieldBattleUnitSnapshot): {
    x: number;
    y: number;
    colSpan: number;
    rowSpan: number;
  } {
    const cells = getOccupiedCells(unit.deployment.anchor, unit.shape);
    const rowSpan =
      Math.max(...cells.map((c) => c.row)) -
      Math.min(...cells.map((c) => c.row)) +
      1;
    const colSpan =
      Math.max(...cells.map((c) => c.col)) -
      Math.min(...cells.map((c) => c.col)) +
      1;

    const positions = cells.map((c) => this.cellPixelPos(c.side, c.row, c.col));
    const x = positions.reduce((s, p) => s + p.x, 0) / positions.length;
    const y = positions.reduce((s, p) => s + p.y, 0) / positions.length;

    return { x, y, colSpan, rowSpan };
  }

  private createUnitView(unit: FieldBattleUnitSnapshot): void {
    const { x, y, colSpan, rowSpan } = this.getUnitViewGeometry(unit);
    const { textureKey, states } = this.getSpriteRenderData(unit);

    const view = new UnitView(
      this,
      x,
      y,
      unit,
      colSpan,
      rowSpan,
      textureKey,
      states,
      this.effectTooltip,
    );
    this.unitViews.set(unit.id, view);
  }

  private destroyUnitView(unitId: string): void {
    const view = this.unitViews.get(unitId);
    if (view) {
      view.destroy();
      this.unitViews.delete(unitId);
    }
  }

  private getSpriteRenderData(unit: BattleUnitSnapshot): {
    textureKey: string | undefined;
    states: readonly SpriteState[] | undefined;
  } {
    return {
      textureKey: unit.sprite?.textureKey,
      states: unit.sprite?.states,
    };
  }

  // ─── UI ───────────────────────────────────────────────────────────────────

  private buildUI(): void {
    this.initiativeBar = new InitiativeBar(
      this,
      0,
      Math.round(8 * LAYOUT_SCALE),
    );

    const totalGridW = GRID_ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const rightGridRightEdge = this.scale.width / 2 + SIDE_GAP / 2 + totalGridW;
    const logGap = Math.round(10 * LAYOUT_SCALE);
    this.logX = rightGridRightEdge + logGap;
    this.logY = this.cellPixelPos("enemy", 0, 2).y - CELL_SIZE / 2;
    this.logW = this.scale.width - this.logX - logGap;
    this.logH = this.cellPixelPos("enemy", 0, 0).y + CELL_SIZE / 2 - this.logY;
    this.battleLog = new BattleLog(this, this.logX, this.logY, this.logW);
    this.battleLog.setVisible(false);

    this.statusText = this.add
      .text(
        this.logX + this.logW / 2,
        this.logY + Math.round(26 * LAYOUT_SCALE) + Math.round(8 * LAYOUT_SCALE),
        "",
        {
          fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
          color: BATTLE_VISUAL_THEME.unit.textLight,
          align: "center",
          wordWrap: { width: this.logW },
        },
      )
      .setOrigin(0.5, 0);
    this.statusBaseY = this.statusText.y;

    this.statusHeaderText = this.add
      .text(
        this.logX + this.logW / 2,
        this.statusBaseY,
        "",
        {
          fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
          color: BATTLE_VISUAL_THEME.unit.textLight,
          align: "center",
          wordWrap: { width: this.logW },
        },
      )
      .setOrigin(0.5, 0)
      .setVisible(false);
  }

  private setStatus(msg: string): void {
    this.statusHeaderText?.setVisible(false);
    this.statusText.setY(this.statusBaseY);
    this.statusText.setText(msg);
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  private setupInput(): void {
    for (const [, cell] of this.cellViews) {
      cell.on('pointerdown', () =>
        this.battlePlacement.handlePlacementPointerDown(cell.coord),
      );
      cell.on('pointerup', () => {
        const phase = PhaseManager.getPhase();
        if (phase.type !== 'battle') return;
        if (phase.battlePhase === 'placement') {
          this.battlePlacement.handlePlacementCellClick(cell.coord, phase);
        } else {
          this.onCellClick(cell.coord, phase);
        }
      });

      cell.on('pointerover', () => {
        const phase = PhaseManager.getPhase();
        if (phase.type !== 'battle') return;

        // 1. Living blocker on this cell — preferred tooltip target.
        const livingId = phase.occupancy.cellToUnitId.get(cell.key);
        if (livingId) {
          const unit = phase.unitsById.get(livingId);
          if (unit) {
            this.unitTooltip.showFixed(unit, this.logX, this.logY, this.logW);
            return;
          }
        }

        // 2. No living unit — scan fieldUnitCells for a dead snapshot on
        //    this cell. Select explicitly by lifeState === 'dead'. Do not
        //    infer deadness from absence in occupancy.
        const ids = phase.fieldUnitCells.cellToUnitIds.get(cell.key) ?? [];
        const dead = ids
          .map(id => phase.unitsById.get(id))
          .find(u => !!u && u.lifeState === 'dead');
        if (dead) {
          this.unitTooltip.showFixed(dead, this.logX, this.logY, this.logW);
        }
      });
      cell.on('pointerout', () => this.unitTooltip.hide());
    }
  }

  private onCellClick(coord: CellCoord, phase: BattlePhase): void {
    this.unitTooltip.hide();
    this.battleTurnFlow.handleCellClick(coord, phase);
  }

  // ─── Start Battle ──────────────────────────────────────────────────────────

  private startBattle(): void {
    this.battlePlacement.teardownForCombat();

    for (const [, cell] of this.cellViews) {
      cell.setMode('battle');
    }

    this.battleTurnFlow.beginCombat();
  }

  // ─── State Refresh ─────────────────────────────────────────────────────────

  private onStateChanged(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'battle') return;

    if (phase.battlePhase === 'placement') {
      this.syncUnitViews(phase);
      this.battlePlacement.onPlacementStateChanged(phase);
    } else if (phase.battlePhase !== 'end') {
      this.refreshCells(phase);
      this.syncUnitViews(phase);
      const fieldUnitsById = new Map(phase.fieldUnits.map(u => [u.id, u]));
      this.initiativeBar.update({
        roundQueue:          phase.roundQueue,
        fieldUnitsById,
        previewTargetUnitId: phase.previewTargetUnitId,
        targetHighlightKind: phase.targetHighlightKind,
      });
    }
  }

  private refreshCells(phase: BattlePhase): void {
    const validKeys = new Set(phase.validTargets.map(cellKey));

    for (const [key, cell] of this.cellViews) {
      cell.setHighlight(validKeys.has(key) ? phase.targetHighlightKind : 'none');
      cell.clearEffectPreview();
    }

    if (phase.activeUnit) {
      const cells = getOccupiedCells(phase.activeUnit.deployment.anchor, phase.activeUnit.shape);
      for (const coord of cells) {
        this.cellViews.get(cellKey(coord))?.setHighlight('selected');
      }
    }
  }

  private syncUnitViews(phase: BattlePhase): void {
    const fieldById = new Map(phase.fieldUnits.map(u => [u.id, u]));

    // 1. Destroy views whose unit is no longer a field unit
    //    (e.g. a player unit returned to the bench). Enemies are always field
    //    units during placement, so they are never destroyed here.
    for (const [id] of Array.from(this.unitViews)) {
      if (!fieldById.has(id)) {
        this.destroyUnitView(id);
      }
    }

    // 2. Create views for field units that don't have one yet.
    //    createUnitView() inserts into this.unitViews itself.
    for (const unit of phase.fieldUnits) {
      if (!this.unitViews.has(unit.id)) {
        this.createUnitView(unit);
      }
    }

    // 3. Reposition + update every existing field view from the latest snapshot.
    //    reposition() MUST precede update(): updateEffectSquares() reads the
    //    container position when computing effect-tooltip world coordinates.
    for (const [id, view] of this.unitViews) {
      const snap = fieldById.get(id);
      if (!snap) continue;
      if (!view.active) continue;

      const { x, y } = this.getUnitViewGeometry(snap);
      view.reposition(x, y);
      view.update(snap);
    }
  }

  // ─── Game Over ─────────────────────────────────────────────────────────────

  private showGameOver(eliminatedSide: Side): void {
    const outcome: BattleEndOutcome = eliminatedSide === 'enemy' ? 'victory' : 'defeat';

    const phase         = PhaseManager.getPhase();
    const isDebugBattle = phase.type === 'battle' && phase.sessionSource === 'debug';

    // Overlay navigation stays here as plain callbacks; the overlay does not know PhaseManager.
    const onReplay = (): void => {
      this.cleanup();
      PhaseManager.transition({ type: 'replay' });
    };

    const onExit = (): void => {
      this.cleanup();
      PhaseManager.transition({ type: 'exit_battle', outcome });
    };

    new BattleEndOverlay({
      scene: this,
      outcome,
      isDebugBattle,
      labels: {
        victoryTitle: 'VICTORY!',
        defeatTitle:  'DEFEAT',
        restart:      'Restart Battle',
        exit:         'Exit Battle',
      },
      callbacks: { onReplay, onExit },
    });
  }
}
