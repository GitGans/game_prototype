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
  Col,
  Side,
  SpriteSheetConfig,
} from "../battle/types";
import type { BattleUnitSnapshot } from "../shared/battleSnapshots";
import { buildBattleUnitSnapshot } from "../core/battleSnapshotBuilder";
import { PhaseManager } from '../core/PhaseManager';
import type { PhaseAction } from '../core/phases';
import { type BattlePhaseActionResult, type AutoTurnIntention } from '../core/phaseHandlers/battlePhaseHandler';
import { Button } from '../ui/Button';
import { SkillTooltip } from '../objects/SkillTooltip';
import { SkillBar } from '../objects/SkillBar';
import { BattleEndOverlay, BattleEndOutcome } from '../objects/BattleEndOverlay';
import { getUnitSpriteTextureKey } from "../core/unitSpriteKey";
import { cellKey } from "../battle/field";
import { getOccupiedCells } from "../battle/shapes";
import {
  getActiveSkill,
  isEnchantmentSkill,
} from "../battle/skillRuntime";
import { BATTLE_VISUAL_THEME } from "../objects/battleVisualTheme";
import { buildManualTargetStatusText } from '../objects/battleDirectivePresentation';
import { hasChargedThisRound } from '../battle/turnResolver';
import { BattlePresentationController } from './controllers/BattlePresentationController';
import { BattlePlacementController } from './controllers/BattlePlacementController';

type BattlePhase = Extract<import('../core/phases').GamePhase, { type: 'battle' }>;

// Local alias over PhaseAction so TypeScript can check battle turn dispatch sites.
type BattleTurnSceneAction = Extract<PhaseAction, {
  type:
    | 'battle_start_turn'
    | 'battle_select_skill'
    | 'battle_use_skill'
    | 'battle_advance_turn'
    | 'battle_skip_turn'
    | 'battle_charge_turn'
    | 'battle_quick_turn'
    | 'battle_decide_auto_turn'
    | 'battle_apply_auto_turn'
}>;

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

  // Delays (ms)
  private static readonly DELAY_ENEMY_THINK = 700;
  private static readonly DELAY_AUTO_THINK = 200;
  private static readonly DELAY_NEXT_TURN = 500;
  private static readonly DELAY_AUTO_NEXT   = 150;
  private static readonly DELAY_GAMEOVER    = 600;
  private static readonly DELAY_AUTO_IMPACT = 200;

  private autoBattleButtons: Button[] = [];
  private manualTurnButtons: Button[] = [];
  private chargeBtn: Button | null = null;
  private pendingTargetCoord: CellCoord | null = null;
  private skillBar!: SkillBar;

  private battlePresentation!: BattlePresentationController;
  private battlePlacement!: BattlePlacementController;

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

    this.setupInput();
    this.battlePlacement.enterPlacementPhase();

    EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this);
  }

  shutdown(): void {
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
    if (phase.battlePhase !== 'select_target') return;
    if (!phase.activeUnitId) return;

    const isValid = phase.validTargets.some(
      c => c.side === coord.side && c.row === coord.row && c.col === coord.col,
    );
    if (!isValid) return;

    const p = this.pendingTargetCoord;
    if (p && p.side === coord.side && p.row === coord.row && p.col === coord.col) {
      this.pendingTargetCoord = null;
      this.refreshCells(phase);
      this.handleTargetSelect(coord, phase);
    } else {
      this.pendingTargetCoord = coord;
      this.battlePresentation.applySkillPreview(phase, coord);
    }
  }

  // ─── Start Battle ──────────────────────────────────────────────────────────

  private startBattle(): void {
    this.battlePlacement.teardownForCombat();

    for (const [, cell] of this.cellViews) {
      cell.setMode('battle');
    }

    PhaseManager.transition({ type: 'battle_begin_combat' });

    this.setStatus("");
    this.battleLog.setVisible(true);
    this.buildAutoBattleButtons();
    this.startActiveUnitTurn(GameState.get());
  }

  // ─── Turn Action Helpers ────────────────────────────────────────────────────

  private runBattleAction(action: BattleTurnSceneAction): BattlePhaseActionResult | null {
    PhaseManager.transition(action);
    return PhaseManager.getLastBattleTransition();
  }

  private playAttackAnimation(unitId: string): void {
    const unitView = this.unitViews.get(unitId);
    unitView?.setSpriteState('attack');
    this.time.delayedCall(400, () => {
      const current = GameState.get().units.get(unitId);
      if (current && current.hp > 0) unitView?.setSpriteState('idle');
    });
  }

  private handleBattleWinner(
    result: BattlePhaseActionResult | null,
    options?: { destroyAutoButtons?: boolean; delay?: number },
  ): boolean {
    if (!result?.winner) return false;
    const delay = options?.delay ?? Game.DELAY_GAMEOVER;
    this.time.delayedCall(delay, () => {
      if (options?.destroyAutoButtons) this.destroyAutoBattleButtons();
      this.showGameOver(result.winner!);
    });
    return true;
  }

  // ─── Turn Flow ─────────────────────────────────────────────────────────────

  private startActiveUnitTurn(state: BattleState): void {
    this.pendingTargetCoord = null;
    this.clearSkillIcons();

    const result = this.runBattleAction({ type: 'battle_start_turn' });
    if (!result) return;

    // 'none' means empty queue or battle already ended — nothing to commit
    if (!result.directive || result.directive.type === 'none') return;

    // activeUnit before turn start — only needed for presentBattleEvents style hint
    const activeUnit = state.units.get(state.roundQueue[0]);
    this.battlePresentation.presentBattleEvents(result.events, activeUnit);
    this.updateManualButtons(result.state);

    switch (result.directive.type) {
      case 'continue_immediately': {
        // Queue recovery: active unit was missing; battle_start_turn advanced queue.
        // Effect ticks may have killed units — check before recursing.
        if (this.handleBattleWinner(result)) return;
        this.startActiveUnitTurn(result.state);
        return;
      }

      case 'schedule_next_turn': {
        // Melee unit was blocked; battle_start_turn advanced queue.
        if (this.handleBattleWinner(result)) return;
        this.time.delayedCall(Game.DELAY_NEXT_TURN, () =>
          this.startActiveUnitTurn(result.state),
        );
        return;
      }

      case 'schedule_auto_turn': {
        const unit = result.state.units.get(result.directive.activeUnitId);
        this.battlePresentation.applyDirectivePresentation({
          directive: result.directive,
          unitName: unit?.name ?? null,
        });

        if (result.directive.delayKind === 'auto_player') {
          this.time.delayedCall(Game.DELAY_AUTO_THINK, () => this.autoTurn());
        } else {
          this.time.delayedCall(Game.DELAY_ENEMY_THINK, () => this.autoTurn());
        }
        return;
      }

      case 'await_manual_target': {
        const phase = PhaseManager.getPhase();
        const activeUnit = phase.type === 'battle' ? phase.activeUnit : null;

        const presentation = this.battlePresentation.applyDirectivePresentation({
          directive: result.directive,
          unitName: activeUnit?.name ?? null,
        });

        if (presentation.displaySkillBar && activeUnit) {
          this.showSkillIcons(activeUnit);
        }
        return;
      }
    }
  }


  private handleTargetSelect(coord: CellCoord, phase: BattlePhase): void {
    const attackerId = phase.activeUnitId!;
    const activeUnit = phase.activeUnit;

    // Sprite animation — stays in scene (Phaser, not logic)
    this.playAttackAnimation(attackerId);

    // battle_use_skill composes: executeSkillUse → checkGameOver → advanceTurn → checkGameOver
    const result = this.runBattleAction({
      type: 'battle_use_skill',
      unitId: attackerId,
      target: coord,
    });
    if (!result) return;

    this.battlePresentation.presentBattleEvents(result.events, activeUnit);

    if (this.handleBattleWinner(result)) return;

    this.time.delayedCall(Game.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(result.state),
    );
  }


  private autoTurn(): void {
    // Core decides what the auto unit will do — no state mutation.
    const decided = this.runBattleAction({ type: 'battle_decide_auto_turn' });
    if (!decided) return;

    const directive = decided.autoTurnDirective;

    if (!directive || directive.type === 'none') return;

    if (directive.type === 'handoff_manual' || directive.type === 'restart_turn') {
      this.startActiveUnitTurn(decided.state);
      return;
    }

    // directive.type === 'intention'
    const { intention, animateAttack } = directive;

    if (animateAttack) {
      // Animation starts; apply fires after the impact delay.
      this.playAttackAnimation(intention.unitId);
      this.time.delayedCall(Game.DELAY_AUTO_IMPACT, () =>
        this.applyAutoTurnAndPresent(intention),
      );
    } else {
      // Skip and advance have no animation — apply immediately.
      this.applyAutoTurnAndPresent(intention);
    }
  }

  private applyAutoTurnAndPresent(intention: AutoTurnIntention): void {
    const applied = this.runBattleAction({ type: 'battle_apply_auto_turn' });
    if (!applied) return;

    // If the intention became stale during DELAY_AUTO_IMPACT (mode change, battle
    // end, replay), core returns autoTurnApplied: false — do not schedule next turn.
    if (!applied.autoTurnApplied) return;

    this.battlePresentation.presentBattleEvents(applied.events, intention.activeUnitSide);

    if (this.handleBattleWinner(applied, { destroyAutoButtons: true })) return;

    this.time.delayedCall(Game.DELAY_AUTO_NEXT, () =>
      this.startActiveUnitTurn(applied.state),
    );
  }

  private runQuickBattle(): void {
    // Reset turn context so charge-tracking from a prior manual turn does not leak in.
    // Emits one STATE_CHANGED before the scene goes silent — that is acceptable.
    PhaseManager.transition({ type: 'battle_prepare_quick_battle' });

    // Detach this scene's listener: quick battle is a silent simulation — no redraws
    // until done. This does not suppress global EventBus emission; other listeners still
    // receive STATE_CHANGED on every iteration.
    EventBus.off(Events.STATE_CHANGED, this.onStateChanged, this);

    const MAX_ITERATIONS = 2000;
    let i = 0;
    let finalWinner: Side | null = null;

    try {
      while (i++ < MAX_ITERATIONS) {
        const state = GameState.get();
        const unitId = state.roundQueue[0];
        if (!unitId) break;

        const result = this.runBattleAction({ type: 'battle_quick_turn', unitId });
        if (!result) break;

        if (result.winner) {
          finalWinner = result.winner;
          break;
        }
      }
    } finally {
      // Always reattach, even if an error occurs, so the scene stays live.
      EventBus.on(Events.STATE_CHANGED, this.onStateChanged, this);
    }

    PhaseManager.transition({ type: 'battle_mark_quick_battle_complete' });

    this.time.delayedCall(200, () => this.showGameOver(finalWinner ?? 'player'));
  }

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
      onClick: () => {
        if (GameState.getBattleMode() === "auto") {
          PhaseManager.transition({ type: 'battle_set_mode', mode: 'manual' });
          this.updateManualButtons(GameState.get());
          return;
        }
        if (GameState.getBattleMode() !== "manual") return;
        PhaseManager.transition({ type: 'battle_set_mode', mode: 'auto' });
        this.updateManualButtons(GameState.get());
        const s = GameState.get();
        if (s.phase === "select_target") {
          const active = s.units.get(s.roundQueue[0]);
          if (active?.anchor.side === "player") {
            // battle_start_turn resets validTargets and recomputes directive.
            // Must consume events and winner: start_turn may advance internally.
            const result = this.runBattleAction({ type: 'battle_start_turn' });
            if (!result) return;
            this.battlePresentation.presentBattleEvents(result.events, active);
            if (this.handleBattleWinner(result)) return;
            if (result.directive?.type === 'schedule_auto_turn') {
              this.time.delayedCall(Game.DELAY_AUTO_THINK, () => this.autoTurn());
            }
          }
        }
      },
    });

    const quickBtn = new Button({
      scene: this, x: x2, y, w: btnW, h: btnH,
      label: "⚡", style: "neutral", fontKey: "lg", idle: true,
      onClick: () => {
        PhaseManager.transition({ type: 'battle_set_mode', mode: 'quick' });
        this.runQuickBattle();
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

  private handleSkipTurn(): void {
    // Pre-action active unit: used only as style hint for presentBattleEvents.
    const state = GameState.get();
    const activeUnit = state.units.get(state.roundQueue[0]);

    const result = this.runBattleAction({ type: 'battle_skip_turn', reason: 'manual_skip' });
    if (!result) return;

    this.battlePresentation.presentBattleEvents(result.events, activeUnit);
    this.updateManualButtons(result.state);

    if (this.handleBattleWinner(result)) return;

    this.time.delayedCall(Game.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(result.state),
    );
  }

  private handleChargeTurn(): void {
    const state = GameState.get();
    const activeUnit = state.units.get(state.roundQueue[0]);

    const result = this.runBattleAction({ type: 'battle_charge_turn' });
    if (!result) return;

    this.battlePresentation.presentBattleEvents(result.events, activeUnit);
    this.updateManualButtons(result.state);

    // Charge does not deal damage, but withWinner() wraps defensively — respect it.
    if (this.handleBattleWinner(result)) return;

    this.time.delayedCall(Game.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(result.state),
    );
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
        this.handleSkipTurn();
      },
    });

    const chargeBtn = new Button({
      scene: this, x: xCharge, y, w: btnW, h: btnH,
      label: "⏳", style: "primary", fontKey: "lg", idle: true,
      onClick: () => {
        if (GameState.getBattleMode() !== "manual") return;
        this.handleChargeTurn();
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

  // ─── Skill Icon UI ─────────────────────────────────────────────────────────

  private showSkillIcons(unit: BattleUnitSnapshot): void {
    if (unit.skills.length < 1) { this.skillBar.hide(); return; }

    // 6 icons × 20px + 5 gaps × 3px = 135px — fits within one CELL_SIZE (126*LAYOUT_SCALE).
    const iconSize = Math.round(20 * LAYOUT_SCALE);
    const iconGap  = Math.round(3  * LAYOUT_SCALE);

    const occupiedCells = getOccupiedCells(unit.anchor, unit.shape);
    const rightmostCol  = Math.max(...occupiedCells.map(c => c.col)) as Col;
    const topRow        = Math.min(...occupiedCells.map(c => c.row));
    const bottomRow     = Math.max(...occupiedCells.map(c => c.row));

    const rightCellPos = this.cellPixelPos(unit.anchor.side, topRow, rightmostCol);
    const iconX        = rightCellPos.x + CELL_SIZE / 2 + iconGap + iconSize / 2;

    const unitTopY    = this.cellPixelPos(unit.anchor.side, topRow,    rightmostCol).y - CELL_SIZE / 2;
    const unitBottomY = this.cellPixelPos(unit.anchor.side, bottomRow, rightmostCol).y + CELL_SIZE / 2;
    const unitCenterY = (unitTopY + unitBottomY) / 2;
    const totalH      = unit.skills.length * iconSize + (unit.skills.length - 1) * iconGap;
    const startY      = unitCenterY - totalH / 2 + iconSize / 2;

    this.skillBar.show(unit, iconX, startY, iconSize, iconGap, i => this.switchActiveSkill(i));
  }

  private clearSkillIcons(): void {
    this.skillBar.hide();
  }

  private switchActiveSkill(index: number): void {
    const result = this.runBattleAction({ type: 'battle_select_skill', skillIndex: index });
    if (!result) return;

    this.pendingTargetCoord = null;

    const phase = PhaseManager.getPhase();
    const activeUnit = phase.type === 'battle' ? phase.activeUnit : null;
    const skill = activeUnit ? getActiveSkill(activeUnit) : undefined;

    if (!activeUnit || !skill) return;

    this.setStatus(
      buildManualTargetStatusText(
        isEnchantmentSkill(skill) ? 'heal' : 'attack',
        activeUnit.name,
      ),
    );
    this.showSkillIcons(activeUnit);
  }


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
