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
import { GameState } from "../core/GameState";
import { CellView } from "../objects/CellView";
import { UnitView } from "../objects/UnitView";
import { InitiativeBar } from "../objects/InitiativeBar";
import { BattleLog } from "../objects/BattleLog";
import { UnitTooltip } from "../objects/UnitTooltip";
import { EffectTooltip } from "../objects/EffectTooltip";
import { UI_THEME } from "../ui/theme";
import {
  BattleState,
  CellCoord,
  Side,
  SpriteSheetConfig,
} from "../battle/types";
import type { BattleUnitSnapshot } from "../shared/battleSnapshots";
import { buildBattleUnitSnapshot } from "../core/battleSnapshotBuilder";
import { PhaseManager } from '../core/PhaseManager';
import { Button } from '../ui/Button';
import { SkillTooltip } from '../objects/SkillTooltip';
import { SkillBar } from '../objects/SkillBar';
import { BattleEndOverlay, BattleEndOutcome } from '../objects/BattleEndOverlay';
import { getUnitSpriteTextureKey } from "../core/unitSpriteKey";
import { cellKey } from "../battle/field";
import { getOccupiedCells } from "../battle/shapes";
import { BATTLE_VISUAL_THEME } from "../objects/battleVisualTheme";
import { hasChargedThisRound } from '../battle/turnResolver';
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

  private autoBattleButtons: Button[] = [];
  private manualTurnButtons: Button[] = [];
  private chargeBtn: Button | null = null;
  private skillBar!: SkillBar;

  private battlePresentation!: BattlePresentationController;
  private battlePlacement!: BattlePlacementController;
  private battleTurnFlow!: BattleTurnFlowController;

  constructor() {
    super("Game");
  }

  create(): void {
    this.unitViews.clear();

    this.buildGrid();
    this.unitTooltip = new UnitTooltip(this, UI_THEME.component.tooltip.bg, UI_THEME.component.tooltip.bgAlpha);
    this.effectTooltip = new EffectTooltip(this);
    this.skillBar = new SkillBar(this, new SkillTooltip(this));
    this.buildUnitViews();
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
      unitViews: this.unitViews,
      unitTooltip: this.unitTooltip,
      getLogBounds: () => ({ x: this.logX, y: this.logY, w: this.logW, h: this.logH }),
      cellPixelPos: (side, row, col) => this.cellPixelPos(side, row, col),
      setStatus: text => this.setStatus(text),
      setBattleLogVisible: visible => this.battleLog.setVisible(visible),
      createUnitView: unit => this.createUnitView(unit),
      destroyUnitView: unitId => this.destroyUnitView(unitId),
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
      updateManualButtons: state => this.updateManualButtons(state),
      detachStateChangedListener: () =>
        EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this),
      attachStateChangedListener: () =>
        EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this),
    });

    this.setupInput();
    this.battlePlacement.enterPlacementPhase();

    EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  shutdown(): void {
    this.battleTurnFlow?.destroy();
    EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this);
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

  private buildUnitViews(): void {
    const state = GameState.get();
    for (const unit of state.units.values()) {
      this.createUnitView(buildBattleUnitSnapshot(unit));
    }
  }

  private createUnitView(unit: BattleUnitSnapshot): void {
    const cells = getOccupiedCells(unit.anchor, unit.shape);
    const rowSpan =
      Math.max(...cells.map((c) => c.row)) -
      Math.min(...cells.map((c) => c.row)) +
      1;
    const colSpan =
      Math.max(...cells.map((c) => c.col)) -
      Math.min(...cells.map((c) => c.col)) +
      1;

    const positions = cells.map((c) => this.cellPixelPos(c.side, c.row, c.col));
    const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
    const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;

    const { key: textureKey, config: spriteConfig } =
      this.getSpriteKeyAndConfig(unit);
    const view = new UnitView(
      this,
      cx,
      cy,
      unit,
      colSpan,
      rowSpan,
      textureKey,
      spriteConfig,
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

  private getSpriteKeyAndConfig(unit: BattleUnitSnapshot): {
    key: string | undefined;
    config: SpriteSheetConfig | undefined;
  } {
    if (!unit.spriteSheet) return { key: undefined, config: undefined };
    return {
      key: getUnitSpriteTextureKey(unit.templateId, unit.spriteSheet),
      config: unit.spriteSheet,
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
        const unitId = phase.occupancy.cellToUnitId.get(cell.key);
        const unit   = unitId ? phase.unitsById.get(unitId) : undefined;
        if (unit && unit.hp > 0) {
          this.unitTooltip.showFixed(unit, this.logX, this.logY, this.logW);
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

    this.buildAutoBattleButtons();
    this.battleTurnFlow.beginCombat();
  }

  // ─── Battle Control Buttons ────────────────────────────────────────────────

  private buildAutoBattleButtons(): void {
    const btnW = Math.round(44 * LAYOUT_SCALE);
    const btnH = Math.round(34 * LAYOUT_SCALE);
    const gap  = Math.round(8  * LAYOUT_SCALE);
    const y    = this.scale.height - btnH / 2 - Math.round(12 * LAYOUT_SCALE);
    const x1   = btnW / 2 + Math.round(12 * LAYOUT_SCALE);
    const x2   = x1 + btnW + gap;

    const autoBtn = new Button({
      scene: this, x: x1, y, w: btnW, h: btnH,
      label: "▶▶", style: "navy", fontKey: "lg", idle: true,
      onClick: () => this.battleTurnFlow.toggleAutoMode(),
    });

    const quickBtn = new Button({
      scene: this, x: x2, y, w: btnW, h: btnH,
      label: "⚡", style: "neutral", fontKey: "lg", idle: true,
      onClick: () => {
        PhaseManager.transition({ type: 'battle_set_mode', mode: 'quick' });
        this.battleTurnFlow.runQuickBattle();
      },
    });

    this.autoBattleButtons = [autoBtn, quickBtn];
    this.buildManualTurnButtons();
  }

  private destroyAutoBattleButtons(): void {
    for (const btn of this.autoBattleButtons) btn.destroy();
    this.autoBattleButtons = [];
    for (const btn of this.manualTurnButtons) btn.destroy();
    this.manualTurnButtons = [];
    this.chargeBtn = null;
  }

  private updateManualButtons(state: BattleState): void {
    if (this.manualTurnButtons.length === 0) return;
    const mode = GameState.getBattleMode();
    const activeUnit = state.units.get(state.roundQueue[0]);
    const show = mode === "manual" && activeUnit?.anchor.side === "player";
    for (const btn of this.manualTurnButtons) btn.setVisible(show);
    if (show && this.chargeBtn) {
      const used = hasChargedThisRound(GameState.getBattleTurnContext(), state.roundQueue[0]);
      this.chargeBtn.setDisabled(used);
    }
  }

  private buildManualTurnButtons(): void {
    const btnW    = Math.round(44 * LAYOUT_SCALE);
    const btnH    = Math.round(34 * LAYOUT_SCALE);
    const gap     = Math.round(8  * LAYOUT_SCALE);
    const y       = this.scale.height - btnH / 2 - Math.round(12 * LAYOUT_SCALE);
    const xSkip   = this.scale.width - btnW / 2 - Math.round(12 * LAYOUT_SCALE);
    const xCharge = xSkip - btnW - gap;

    const skipBtn = new Button({
      scene: this, x: xSkip, y, w: btnW, h: btnH,
      label: "🛡️", style: "ghost", fontKey: "lg", idle: true,
      onClick: () => {
        if (GameState.getBattleMode() !== "manual") return;
        this.battleTurnFlow.skipTurn();
      },
    });

    const chargeBtn = new Button({
      scene: this, x: xCharge, y, w: btnW, h: btnH,
      label: "⏳", style: "primary", fontKey: "lg", idle: true,
      onClick: () => {
        if (GameState.getBattleMode() !== "manual") return;
        this.battleTurnFlow.chargeTurn();
      },
    });

    this.chargeBtn = chargeBtn;
    this.manualTurnButtons = [skipBtn, chargeBtn];

    for (const b of this.manualTurnButtons) b.setVisible(false);
  }

  // ─── State Refresh ─────────────────────────────────────────────────────────

  private onStateChanged(): void {
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'battle') return;

    if (phase.battlePhase === 'placement') {
      this.battlePlacement.onPlacementStateChanged(phase);
    } else if (phase.battlePhase !== 'end') {
      this.refreshCells(phase);
      this.refreshUnits(phase);
      this.initiativeBar.update({ roundQueue: phase.roundQueue, unitsById: phase.unitsById });
    }
  }

  private refreshCells(phase: BattlePhase): void {
    const validKeys = new Set(phase.validTargets.map(cellKey));

    for (const [key, cell] of this.cellViews) {
      cell.setHighlight(validKeys.has(key) ? phase.targetHighlightKind : 'none');
      cell.clearEffectPreview();
    }

    if (phase.activeUnit) {
      const cells = getOccupiedCells(phase.activeUnit.anchor, phase.activeUnit.shape);
      for (const coord of cells) {
        this.cellViews.get(cellKey(coord))?.setHighlight('selected');
      }
    }
  }

  private refreshUnits(phase: BattlePhase): void {
    for (const [id, view] of this.unitViews) {
      if (!view.active) continue;
      view.update(phase.unitsById.get(id) ?? null);
    }
  }

  // ─── Game Over ─────────────────────────────────────────────────────────────

  private showGameOver(eliminatedSide: Side): void {
    // Battle runtime cleanup — stays in Game.ts, not in the overlay component.
    this.destroyAutoBattleButtons();

    // checkGameOver returns the side with no surviving units.
    const outcome: BattleEndOutcome = eliminatedSide === 'enemy' ? 'victory' : 'defeat';

    const phase         = PhaseManager.getPhase();
    const isDebugBattle = phase.type === 'battle' && phase.returnPhase.type === 'main_menu';

    // All game decisions (PhaseManager, GameState) stay here as closures.
    // BattleEndOverlay receives only the resulting functions, not the game knowledge.
    const onReplay = (): void => {
      PhaseManager.transition({ type: 'replay' });
    };

    const onExit = (): void => {
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
