import Phaser from "phaser";
import {
  CELL_SIZE,
  CELL_GAP,
  GRID_COLS,
  GRID_ROWS,
  SIDE_GAP,
  BENCH_PANEL_WIDTH,
  BENCH_GAP,
  BENCH_SLOTS,
  LAYOUT_SCALE,
} from "../core/Constants";
import { BATTLE_VISUAL_THEME } from "../objects/battleVisualTheme";
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
  Unit,
  SpriteSheetConfig,
} from "../battle/types";
import type { PlacementSelection } from "../battle/types";
import type { BenchUnitSnapshot } from "../shared/battleSnapshots";
import { PhaseManager } from '../core/PhaseManager';
import { BattleParticipant } from '../core/phases';
import { Button } from '../ui/Button';
import { SkillTooltip } from '../objects/SkillTooltip';
import { SkillBar } from '../objects/SkillBar';
import { BattleEndOverlay, BattleEndOutcome } from '../objects/BattleEndOverlay';
import { BenchCard, type BenchCardMode } from '../objects/BenchCard';
import { getUnitSpriteTextureKey } from "../core/unitSpriteKey";
import { cellKey } from "../battle/field";
import { getOccupiedCells } from "../battle/shapes";
import { resolveSkillTargets } from "../battle/targeting";
import {
  getActiveSkill,
  getSkillHitCells,
  isEnchantmentSkill,
  resolveEffectArgs,
  resolveRandomSkillIndex,
  resolveRandomTarget,
  resolveBestHealTarget,
} from "../battle/skillRuntime";
import { computeOneTurn } from "../battle/quickTurn";
import { checkGameOver, effectiveStats, EffectEvent, computeDamageVsUnit } from "../battle/combat";
import { resolvePattern } from "../battle/skillPatterns";
import { getEffectPattern, getDamageModifierPercent } from "../data/skillDefinitions";
import { buildRoundQueue } from "../battle/initiative";
import { executeSkillUse } from '../battle/skillExecution';
import type { BattleEvent } from '../battle/battleEvents';
import {
  resolveActiveTurnStart,
  advanceTurn,
  skipActiveTurn,
  chargeActiveTurn,
  switchActiveSkillForManualTurn,
  createTurnContext,
  resetTurnContextForNewBattle,
  getSkillQueueContext,
  hasChargedThisRound,
  type TurnEvent,
} from '../battle/turnResolver';

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
  private static readonly DELAY_AUTO_NEXT = 150;
  private static readonly DELAY_GAMEOVER = 600;

  // Placement phase UI
  private benchCards: BenchCard[] = [];
  private startBattleBtn: Button | null = null;
  private autoBattleButtons: Button[] = [];
  private turnContext = createTurnContext();
  private manualTurnButtons: Button[] = [];
  private chargeBtn: Button | null = null;
  private pendingTargetCoord: CellCoord | null = null;
  private lastClickCoordKey: string | null = null;
  private skillBar!: SkillBar;
  private lastClickTime = 0;

  private prevPlacementUnits: Map<string, Unit> | null = null;

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
    this.prevPlacementUnits = null;
    this.buildUI();
    this.setupInput();
    this.enterPlacementPhase();

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
      this.createUnitView(unit);
    }
  }

  private createUnitView(unit: Unit): void {
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

  private getSpriteKeyAndConfig(unit: Unit): {
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

  // ─── Placement Phase ───────────────────────────────────────────────────────

  private enterPlacementPhase(): void {
    this.setStatus('Place your troops and click "Battle"');
    this.battleLog.setVisible(false);
    this.buildBenchPanel();
    this.buildStartBattleButton();
  }

  private benchCardHeight(): number {
    return CELL_SIZE;
  }

  private benchPanelX(): number {
    return BENCH_GAP + BENCH_PANEL_WIDTH / 2;
  }

  private buildBenchPanel(interactive = true): void {
    for (const card of this.benchCards) card.destroy();
    this.benchCards = [];

    const phase = PhaseManager.getPhase();
    if (phase.type !== 'battle') return;

    const cardH  = this.benchCardHeight();
    const panelX = this.benchPanelX();
    const mode: BenchCardMode = interactive ? 'placement' : 'battle';

    const gridTopY    = this.cellPixelPos('player', 0, 2).y - CELL_SIZE / 2;
    const gridBottomY = this.cellPixelPos('player', 0, 0).y + CELL_SIZE / 2;
    const totalH      = BENCH_SLOTS * cardH + (BENCH_SLOTS - 1) * CELL_GAP;
    const startY      = (gridTopY + gridBottomY) / 2 - totalH / 2 + cardH / 2;

    for (let i = 0; i < BENCH_SLOTS; i++) {
      const snapshot   = phase.benchUnits[i] ?? null;
      const cardY      = startY + i * (cardH + CELL_GAP);
      const isSelected = phase.placementSelection.selectedBenchIdx === i;

      // Build callbacks separately to avoid `...(false | object)` spread — TypeScript
      // cannot narrow that to an object type inside a spread expression.
      const callbacks =
        snapshot === null
          ? { onClick: () => this.onBenchCardClick(i) }
          : {
              onClick:      () => this.onBenchCardClick(i),
              onHoverStart: (snap: BenchUnitSnapshot) =>
                this.unitTooltip.showBenchSnapshot(snap, this.logX, this.logY, this.logW),
              onHoverEnd:   () => this.unitTooltip.hide(),
            };

      const card = new BenchCard({
        scene:    this,
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
    const { selectedBenchIdx, selectedFieldUnitId } = phase.placementSelection;
    const state = GameState.get();

    if (!state.benchUnits[idx]) {
      // Empty slot: move selected field unit here
      if (selectedFieldUnitId !== null) {
        PhaseManager.transition({ type: 'move_field_unit_to_bench', unitId: selectedFieldUnitId, benchIdx: idx });
      }
      return;
    }

    if (selectedFieldUnitId !== null) {
      // Occupied slot + field selected: swap
      PhaseManager.transition({ type: 'swap_bench_with_field', benchIdx: idx, fieldUnitId: selectedFieldUnitId });
      return;
    }

    // Toggle bench selection
    if (selectedBenchIdx === idx) {
      PhaseManager.transition({ type: 'clear_placement_selection' });
    } else {
      PhaseManager.transition({ type: 'select_bench_slot', benchIdx: idx });
    }
  }

  private buildStartBattleButton(): void {
    if (this.startBattleBtn) {
      this.startBattleBtn.destroy();
      this.startBattleBtn = null;
    }

    const btnW = Math.round(160 * LAYOUT_SCALE);
    const btnH = Math.round(100 * LAYOUT_SCALE);
    const btnX = this.logX + this.logW / 2;
    const btnY = this.logY + this.logH / 2;

    this.startBattleBtn = new Button({
      scene: this, x: btnX, y: btnY, w: btnW, h: btnH,
      label: "⚔\nBattle", style: "primary", fontKey: "xl",
      onClick: () => this.startBattle(),
    });
  }

  private clearPlacementHighlights(): void {
    for (const [, cell] of this.cellViews) {
      cell.setHighlight("none");
    }
  }

  // ─── Placement Input ───────────────────────────────────────────────────────

  private onPlacementCellClick(coord: CellCoord): void {
    if (coord.side !== 'player') return;
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'battle') return;
    const { selectedBenchIdx, selectedFieldUnitId } = phase.placementSelection;
    const unitAtCell = GameState.get().occupancy.cellToUnit.get(cellKey(coord));

    if (selectedBenchIdx !== null) {
      if (!unitAtCell) {
        PhaseManager.transition({ type: 'place_bench_unit', benchIdx: selectedBenchIdx, anchor: coord });
      } else {
        PhaseManager.transition({ type: 'swap_bench_with_field', benchIdx: selectedBenchIdx, fieldUnitId: unitAtCell.id });
      }
      return;
    }

    // No bench unit selected
    if (unitAtCell) {
      if (selectedFieldUnitId === null) {
        PhaseManager.transition({ type: 'select_field_unit', unitId: unitAtCell.id });
      } else if (selectedFieldUnitId === unitAtCell.id) {
        PhaseManager.transition({ type: 'clear_placement_selection' });
      } else {
        PhaseManager.transition({ type: 'swap_field_units', unitAId: selectedFieldUnitId, unitBId: unitAtCell.id });
      }
    } else if (selectedFieldUnitId !== null) {
      PhaseManager.transition({ type: 'move_field_unit', unitId: selectedFieldUnitId, anchor: coord });
    }
  }

  // ─── Double Click Detection ────────────────────────────────────────────────

  private handlePointerDown(coord: CellCoord): void {
    if (GameState.get().phase !== "placement") return;
    if (coord.side !== "player") return;

    const key = cellKey(coord);
    const now = Date.now();

    if (key === this.lastClickCoordKey && now - this.lastClickTime < 300) {
      // Double click — return unit to first free bench slot
      const doubleClickUnit = GameState.get().occupancy.cellToUnit.get(key);
      if (doubleClickUnit) {
        PhaseManager.transition({ type: 'return_field_unit_to_bench', unitId: doubleClickUnit.id });
      }
      this.lastClickCoordKey = null;
      this.lastClickTime = 0;
    } else {
      this.lastClickCoordKey = key;
      this.lastClickTime = now;
    }
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  private setupInput(): void {
    for (const [, cell] of this.cellViews) {
      cell.on("pointerdown", () => this.handlePointerDown(cell.coord));
      cell.on("pointerup", () => {
        if (GameState.get().phase === "placement") {
          this.onPlacementCellClick(cell.coord);
        } else {
          this.onCellClick(cell.coord);
        }
      });

      cell.on("pointerover", () => {
        const state = GameState.get();
        const unit = state.occupancy.cellToUnit.get(cell.key);
        if (unit && unit.hp > 0) {
          this.unitTooltip.showFixed(unit, this.logX, this.logY, this.logW);
        }
      });
      cell.on("pointerout", () => {
        this.unitTooltip.hide();
      });
    }
  }

  private onCellClick(coord: CellCoord): void {
    this.unitTooltip.hide();
    const state = GameState.get();
    if (state.phase !== "select_target") return;

    const isValid = state.validTargets.some(
      (c) => c.side === coord.side && c.row === coord.row && c.col === coord.col,
    );
    if (!isValid) return;

    const p = this.pendingTargetCoord;
    if (p && p.side === coord.side && p.row === coord.row && p.col === coord.col) {
      // Second click on the same cell → execute
      this.pendingTargetCoord = null;
      this.refreshCells(state);
      this.handleTargetSelect(coord, state);
    } else {
      // First click or switching target → show preview
      this.pendingTargetCoord = coord;
      this.showSkillPreview(state, coord);
    }
  }

  // ─── Start Battle ──────────────────────────────────────────────────────────

  private startBattle(): void {
    // TODO(post-refactor): move startBattle combat init into the PhaseManager pipeline.
    // Tear down placement UI; keep bench visible as display-only
    this.buildBenchPanel(false);
    if (this.startBattleBtn) {
      this.startBattleBtn.destroy();
      this.startBattleBtn = null;
    }
    this.clearPlacementHighlights();

    for (const [, cell] of this.cellViews) {
      cell.setMode('battle');
    }

    let state = GameState.get();

    // Save player unit positions so they can be restored next battle
    for (const unit of state.units.values()) {
      if (unit.anchor.side !== 'player') continue;
      const us = GameState.playerUnits[unit.templateId];
      if (us) GameState.playerUnits[unit.templateId] = { ...us, lastPlacement: unit.anchor };
    }

    const queue = buildRoundQueue(state.units);
    state = {
      ...state,
      roundQueue:         queue,
      phase:              'select_target',
      placementSelection: { selectedBenchIdx: null, selectedFieldUnitId: null },
    };
    GameState.set(state);
    EventBus.emit(Events.STATE_CHANGED);
    this.setStatus("");
    this.battleLog.setVisible(true);
    this.turnContext = resetTurnContextForNewBattle();
    this.buildAutoBattleButtons();
    this.startActiveUnitTurn(state);
  }

  // ─── Turn Flow ─────────────────────────────────────────────────────────────

  private startActiveUnitTurn(state: BattleState): void {
    this.pendingTargetCoord = null;
    this.clearSkillIcons();

    const result = resolveActiveTurnStart({
      state,
      context: this.turnContext,
      mode: GameState.getBattleMode(),
    });

    // Early exit: battle ended, quick mode, or empty queue — nothing to commit
    if (result.directive.type === 'none') {
      return;
    }

    this.turnContext = result.context;
    GameState.set(result.state);
    EventBus.emit(Events.STATE_CHANGED);
    this.presentTurnEvents(result.events);
    this.updateManualButtons(result.state);

    switch (result.directive.type) {
      case 'continue_immediately': {
        // Technical queue recovery: active unit was missing.
        // advanceTurn may have ticked effects — check game-over before recursing.
        const winner = checkGameOver(result.state);
        if (winner) {
          const final: BattleState = { ...result.state, phase: 'end' };
          GameState.set(final);
          EventBus.emit(Events.STATE_CHANGED);
          this.time.delayedCall(Game.DELAY_GAMEOVER, () => this.showGameOver(winner));
          return;
        }
        this.startActiveUnitTurn(result.state);
        return;
      }

      case 'schedule_next_turn': {
        // Melee unit was blocked — advanceTurn may have ticked effects.
        const winner = checkGameOver(result.state);
        if (winner) {
          const final: BattleState = { ...result.state, phase: 'end' };
          GameState.set(final);
          EventBus.emit(Events.STATE_CHANGED);
          this.time.delayedCall(Game.DELAY_GAMEOVER, () => this.showGameOver(winner));
          return;
        }
        this.time.delayedCall(Game.DELAY_NEXT_TURN, () =>
          this.startActiveUnitTurn(result.state),
        );
        return;
      }

      case 'schedule_auto_turn': {
        // No queue advancement here — autoTurn handles execution and advancement.
        const unit = result.state.units.get(result.directive.activeUnitId);
        if (result.directive.delayKind === 'auto_player') {
          this.setStatus(`${unit?.name ?? '?'} turn… (auto)`);
          this.time.delayedCall(Game.DELAY_AUTO_THINK, () => this.autoTurn());
        } else {
          this.setStatus(`${unit?.name ?? '?'} turn…`);
          this.time.delayedCall(Game.DELAY_ENEMY_THINK, () => this.autoTurn());
        }
        return;
      }

      case 'await_manual_target': {
        const { promptKind, activeUnitId } = result.directive;
        const unit = result.state.units.get(activeUnitId);
        this.setStatus(
          promptKind === 'heal'
            ? `${unit?.name ?? '?'} — Click on the green cell to heal`
            : `${unit?.name ?? '?'} — Click on the red cell to attack`,
        );
        if (unit) this.showSkillIcons(unit);
        return;
      }
    }
  }

  private showSkillPreview(state: BattleState, coord: CellCoord): void {
    const activeUnit = state.units.get(state.roundQueue[0]);
    if (!activeUnit) return;

    this.refreshCells(state);

    const currentSkill = getActiveSkill(activeUnit);
    const hitCells = getSkillHitCells(activeUnit, coord);
    const isHeal = isEnchantmentSkill(currentSkill);

    for (const { coord: hc, multiplier } of hitCells) {
      this.cellViews.get(cellKey(hc))?.setSkillPreview(multiplier, isHeal);
    }

    if (currentSkill.effectBlock) {
      const effectCells = resolvePattern(coord, getEffectPattern(currentSkill.effectBlock));
      const isEffectHeal = isEnchantmentSkill(currentSkill);
      for (const { coord: ec } of effectCells) {
        this.cellViews.get(cellKey(ec))?.setEffectPreview(isEffectHeal);
      }
    }

    const previewParts: string[] = [];
    const seen = new Set<string>();
    const skill = currentSkill;

    // ── Skill header ──────────────────────────────────────────────────────────

    // ── Skill damage / heal lines ─────────────────────────────────────────────
    if (isHeal) {
      for (const { coord: hc } of hitCells) {
        const unit = state.occupancy.cellToUnit.get(cellKey(hc));
        if (!unit || seen.has(unit.id)) continue;
        seen.add(unit.id);
        previewParts.push(`${unit.name} +${effectiveStats(activeUnit).magicalDamage}`);
      }
    } else {
      const damageType = skill.damageBlock?.damageType ?? "physical";
      const attackerStats = effectiveStats(activeUnit);
      const baseDamage = damageType === "physical" ? attackerStats.physicalDamage : attackerStats.magicalDamage;

      const ignorePercent: Partial<Record<string, number>> = {};
      if (skill.damageModifierBlocks) {
        for (const block of skill.damageModifierBlocks) {
          ignorePercent[block.type] = getDamageModifierPercent(block);
        }
      }
      const defIgnoreKey = damageType === "physical" ? "ignore_physical_defense" : "ignore_magical_defense";
      const defIgnore = ignorePercent[defIgnoreKey] ?? 0;

      for (const { coord: hc, multiplier } of hitCells) {
        const unit = state.occupancy.cellToUnit.get(cellKey(hc));
        if (!unit || seen.has(unit.id)) continue;
        seen.add(unit.id);
        const dmg = computeDamageVsUnit(baseDamage, damageType, unit, multiplier, defIgnore);
        previewParts.push(`${unit.name} ~${dmg}`);
      }
    }

    // ── Effect block ──────────────────────────────────────────────────────────
    if (skill.effectBlock) {
      const eb = skill.effectBlock;
      const [resolvedEffect, computedPerTurn] = resolveEffectArgs(skill, activeUnit);
      const effectCellCoords = resolvePattern(coord, getEffectPattern(eb));

      // Effect header
      previewParts.push(`[${eb.effectDisplayName}]`);

      // Per-unit lines only for stat-based effects (damage or heal per round)
      if (computedPerTurn !== undefined) {
        const seenEffect = new Set<string>();
        const sign = resolvedEffect.isBuff ? "+" : "-";
        for (const { coord: ec } of effectCellCoords) {
          const unit = state.occupancy.cellToUnit.get(cellKey(ec));
          if (!unit || seenEffect.has(unit.id)) continue;
          seenEffect.add(unit.id);
          previewParts.push(`${unit.name} ${sign}${computedPerTurn} HP/round`);
        }
      }
      // Defense-only effects: no per-unit lines (no numeric HP value to show)
    }

    // ── Assemble status text ──────────────────────────────────────────────────
    const preview = `Preview:\n${previewParts.join("\n")}\n[click again to confirm]`;
    this.setStatus(preview);

    const headerColor = skill.damageBlock?.damageType === 'magical' ? BATTLE_VISUAL_THEME.skill.magical
                      : skill.damageBlock?.damageType === 'physical' ? BATTLE_VISUAL_THEME.skill.physical
                      : BATTLE_VISUAL_THEME.unit.textLight;
    const lineH = Math.round(14 * LAYOUT_SCALE);
    this.statusHeaderText
      .setColor(headerColor)
      .setText(skill.name)
      .setY(this.statusBaseY)
      .setVisible(true);
    this.statusText.setY(this.statusBaseY + lineH);
  }

  private handleTargetSelect(coord: CellCoord, state: BattleState): void {
    const isValid = state.validTargets.some(
      (c) => c.side === coord.side && c.row === coord.row && c.col === coord.col,
    );
    if (!isValid) return;

    const attackerId = state.roundQueue[0];
    const activeUnit = state.units.get(attackerId);

    // Sprite animation — stays in scene (Phaser, not logic)
    const attackerView = this.unitViews.get(attackerId);
    attackerView?.setSpriteState('attack');
    this.time.delayedCall(400, () => {
      const current = GameState.get().units.get(attackerId);
      if (current && current.hp > 0) attackerView?.setSpriteState('idle');
    });

    const result = executeSkillUse({
      state,
      casterId: attackerId,
      target: coord,
      queueContext: getSkillQueueContext(this.turnContext),
    });

    this.presentBattleEvents(result.events, activeUnit);
    let next = result.state;

    const winner = checkGameOver(next);
    if (winner) {
      next = { ...next, phase: 'end' };
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED);
      this.time.delayedCall(Game.DELAY_GAMEOVER, () => this.showGameOver(winner));
      return;
    }

    const advanced = advanceTurn({ state: next, context: this.turnContext });
    this.turnContext = advanced.context;
    this.presentTurnEvents(advanced.events);
    next = advanced.state;

    const winnerAfterAdvance = checkGameOver(next);
    if (winnerAfterAdvance) {
      next = { ...next, phase: 'end' };
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED);
      this.time.delayedCall(Game.DELAY_GAMEOVER, () => this.showGameOver(winnerAfterAdvance));
      return;
    }

    GameState.set(next);
    EventBus.emit(Events.STATE_CHANGED);
    this.time.delayedCall(Game.DELAY_NEXT_TURN, () => this.startActiveUnitTurn(next));
  }

  private presentBattleEvents(events: BattleEvent[], activeUnit: Unit | undefined): void {
    const style = activeUnit?.anchor.side === 'player' ? 'positive' : 'negative';

    for (const e of events) {
      switch (e.type) {
        case 'skill_heal': {
          const view = this.unitViews.get(e.targetId);
          if (view) this.showFloatingHeal(view.x, view.y, e.amount);
          this.battleLog.addEntry(`${e.casterName} heals ${e.targetName} +${e.amount}`, style);
          break;
        }
        case 'skill_damage': {
          const view = this.unitViews.get(e.targetId);
          if (view) this.showFloatingDamage(view.x, view.y, e.amount);
          this.battleLog.addEntry(
            e.blocked
              ? `${e.casterName} attacks ${e.targetName} — blocked! -${e.amount}`
              : `${e.casterName} attacks ${e.targetName} -${e.amount}`,
            e.blocked ? 'neutral' : style,
          );
          break;
        }
        case 'skill_dodged':
          this.battleLog.addEntry(`${e.targetName} dodged the attack!`, 'neutral');
          break;
        case 'vampirism_heal': {
          const view = this.unitViews.get(e.unitId);
          if (view) this.showFloatingHeal(view.x, view.y, e.amount);
          this.battleLog.addEntry(`${e.unitName} restored ${e.amount} HP (vampirism)`, 'positive');
          break;
        }
        case 'effect_applied':
          this.battleLog.addEntry(`${e.unitName} is affected by ${e.effectDisplayName}`, 'neutral');
          break;
        case 'instant_effect_applied':
          this.battleLog.addEntry(`${e.unitName} is affected by ${e.displayName}!`, 'neutral');
          break;
        case 'instant_effect_failed':
          this.battleLog.addEntry(`${e.displayName} failed on ${e.unitName}`, 'neutral');
          break;
        case 'unit_distracted':
          this.battleLog.addEntry(`${e.unitName} is distracted and skips its turn!`, 'neutral');
          break;
        case 'counter_attack_start':
          this.battleLog.addEntry(`${e.attackerName} is provoked — counter-attacks ${e.targetName}!`, 'neutral');
          break;
        case 'counter_attack_hit': {
          const view = this.unitViews.get(e.targetId);
          if (view) this.showFloatingDamage(view.x, view.y, e.amount);
          this.battleLog.addEntry(
            e.blocked
              ? `${e.attackerName} counter-attacks ${e.targetName} — blocked! -${e.amount}`
              : `${e.attackerName} counter-attacks ${e.targetName} -${e.amount}`,
            'neutral',
          );
          break;
        }
        case 'counter_attack_dodged':
          this.battleLog.addEntry(`${e.targetName} dodged the counter-attack!`, 'neutral');
          break;
        case 'counter_attack_unavailable': {
          const msg = e.reason === 'out_of_range'
            ? `${e.unitName} was provoked but can't reach ${e.targetName} — skips turn`
            : e.reason === 'caster_dead'
              ? `${e.unitName} was provoked but the provoker is gone — skips turn`
              : `${e.unitName} was provoked but has no basic attack — skips turn`;
          this.battleLog.addEntry(msg, 'neutral');
          break;
        }
      }
    }
  }

  private presentTurnEvents(events: TurnEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'turn_skipped':
          if (e.reason === 'manual_skip') {
            this.battleLog.addEntry(`${e.unitName} skips their turn`, 'neutral');
          } else {
            this.battleLog.addEntry(`${e.unitName} — blocked, skipping turn`, 'neutral');
          }
          break;
        case 'turn_charged':
          this.battleLog.addEntry(
            `${e.unitName} charges their turn (acts last this round)`,
            'neutral',
          );
          break;
        case 'round_effect':
          this.logEffectEvent(e.event);
          break;
      }
    }
  }

  private autoTurn(): void {
    let state = GameState.get();
    if (state.phase === 'end') return;

    const unitId = state.roundQueue[0];
    let activeUnit = state.units.get(unitId);
    const isEnemy = activeUnit?.anchor.side === 'enemy';

    // Guard applies only to player units in non-auto mode.
    // Enemy units always act automatically, regardless of battle mode.
    if (!isEnemy && GameState.getBattleMode() !== 'auto') {
      if (GameState.getBattleMode() === 'manual') {
        this.startActiveUnitTurn(state);
      }
      return;
    }
    if (!activeUnit) {
      // 4b: missing active unit — advance, present events, check game-over
      const advanced = advanceTurn({ state, context: this.turnContext });
      this.turnContext = advanced.context;
      this.presentTurnEvents(advanced.events);

      const winner = checkGameOver(advanced.state);
      if (winner) {
        const final: BattleState = { ...advanced.state, phase: 'end' };
        GameState.set(final);
        EventBus.emit(Events.STATE_CHANGED);
        this.time.delayedCall(Game.DELAY_GAMEOVER, () => this.showGameOver(winner));
        return;
      }

      GameState.set(advanced.state);
      this.startActiveUnitTurn(advanced.state);
      return;
    }

    // Pick a random skill for this auto/enemy turn
    const randomSkillIdx = resolveRandomSkillIndex(activeUnit);
    const updatedUnit = { ...activeUnit, activeSkillIndex: randomSkillIdx };
    const updatedUnits = new Map(state.units);
    updatedUnits.set(unitId, updatedUnit);
    state = { ...state, units: updatedUnits };
    GameState.set(state);
    activeUnit = updatedUnit;

    const nextDelay = Game.DELAY_AUTO_NEXT;
    const currentSkill = getActiveSkill(activeUnit);
    const targets = resolveSkillTargets(activeUnit, currentSkill, state.occupancy);

    if (targets.length === 0) {
      // 4c: no valid targets
      if (currentSkill.actionType === 'melee') {
        this.battleLog.addEntry(`${activeUnit.name} — blocked, skipping turn`, 'neutral');
      }
      const advanced = advanceTurn({ state, context: this.turnContext });
      this.turnContext = advanced.context;
      this.presentTurnEvents(advanced.events);

      const winner = checkGameOver(advanced.state);
      if (winner) {
        const final: BattleState = { ...advanced.state, phase: 'end' };
        GameState.set(final);
        EventBus.emit(Events.STATE_CHANGED);
        this.time.delayedCall(Game.DELAY_GAMEOVER, () => this.showGameOver(winner));
        return;
      }

      GameState.set(advanced.state);
      EventBus.emit(Events.STATE_CHANGED);
      this.time.delayedCall(nextDelay, () => this.startActiveUnitTurn(advanced.state));
      return;
    }

    const target = isEnchantmentSkill(currentSkill)
      ? resolveBestHealTarget(state.occupancy, targets)
      : resolveRandomTarget(targets);
    if (!target) {
      // 4d: null target
      const advanced = advanceTurn({ state, context: this.turnContext });
      this.turnContext = advanced.context;
      this.presentTurnEvents(advanced.events);

      const winner = checkGameOver(advanced.state);
      if (winner) {
        const final: BattleState = { ...advanced.state, phase: 'end' };
        GameState.set(final);
        EventBus.emit(Events.STATE_CHANGED);
        this.time.delayedCall(Game.DELAY_GAMEOVER, () => this.showGameOver(winner));
        return;
      }

      GameState.set(advanced.state);
      EventBus.emit(Events.STATE_CHANGED);
      this.time.delayedCall(nextDelay, () => this.startActiveUnitTurn(advanced.state));
      return;
    }

    // Sprite animation — stays in scene (Phaser, not logic)
    const unitView = this.unitViews.get(unitId);
    unitView?.setSpriteState('attack');
    this.time.delayedCall(400, () => {
      const current = GameState.get().units.get(unitId);
      if (current && current.hp > 0) unitView?.setSpriteState('idle');
    });

    const result = executeSkillUse({
      state,
      casterId: activeUnit.id,
      skill: currentSkill,
      target,
      queueContext: getSkillQueueContext(this.turnContext),
    });

    this.presentBattleEvents(result.events, activeUnit);
    let next = result.state;

    const winner = checkGameOver(next);
    if (winner) {
      next = { ...next, phase: 'end' };
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED);
      this.time.delayedCall(Game.DELAY_GAMEOVER, () => {
        this.destroyAutoBattleButtons();
        this.showGameOver(winner);
      });
      return;
    }

    // 4e: post-execution advancement
    const advanced = advanceTurn({ state: next, context: this.turnContext });
    this.turnContext = advanced.context;
    this.presentTurnEvents(advanced.events);
    next = advanced.state;

    const winnerAfterAdvance = checkGameOver(next);
    if (winnerAfterAdvance) {
      next = { ...next, phase: 'end' };
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED);
      this.time.delayedCall(Game.DELAY_GAMEOVER, () => {
        this.destroyAutoBattleButtons();
        this.showGameOver(winnerAfterAdvance);
      });
      return;
    }

    GameState.set(next);
    EventBus.emit(Events.STATE_CHANGED);
    this.time.delayedCall(nextDelay, () => this.startActiveUnitTurn(next));
  }

  private runQuickBattle(): void {
    let state = GameState.get();
    let context = resetTurnContextForNewBattle();
    const MAX_ITERATIONS = 2000;
    let i = 0;

    while (i++ < MAX_ITERATIONS) {
      const unitId = state.roundQueue[0];
      if (!unitId) break;

      state = computeOneTurn(state, unitId, {
        queueContext: getSkillQueueContext(context),
      });

      const advanced = advanceTurn({ state, context });
      state = advanced.state;
      context = advanced.context;
      // TurnEvents are not rendered in quick battle — it is a silent simulation

      const winner = checkGameOver(state);
      if (winner) {
        state = { ...state, phase: "end" };
        break;
      }
    }

    state = { ...state, phase: "end" };
    GameState.set(state);
    EventBus.emit(Events.STATE_CHANGED);

    const winner = checkGameOver(state);
    this.time.delayedCall(200, () => this.showGameOver(winner ?? "player"));
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
          GameState.setBattleMode("manual");
          this.updateManualButtons(GameState.get());
          return;
        }
        if (GameState.getBattleMode() !== "manual") return;
        GameState.setBattleMode("auto");
        this.updateManualButtons(GameState.get());
        const s = GameState.get();
        if (s.phase === "select_target") {
          const active = s.units.get(s.roundQueue[0]);
          if (active?.anchor.side === "player") {
            const next: BattleState = { ...s, validTargets: [] };
            GameState.set(next);
            EventBus.emit(Events.STATE_CHANGED);
            this.time.delayedCall(Game.DELAY_AUTO_THINK, () => this.autoTurn());
          }
        }
      },
    });

    const quickBtn = new Button({
      scene: this, x: x2, y, w: btnW, h: btnH,
      label: "⚡", style: "neutral", fontKey: "lg", idle: true,
      onClick: () => {
        GameState.setBattleMode("quick");
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

  private logEffectEvent(e: EffectEvent): void {
    switch (e.type) {
      case 'effect_applied':
        this.battleLog.addEntry(`${e.unitName} is affected by ${e.effectDisplayName}`, 'neutral');
        break;
      case 'effect_tick_heal':
        this.battleLog.addEntry(`${e.unitName} regenerates +${e.amount} HP (${e.effectDisplayName})`, 'positive');
        break;
      case 'effect_tick_damage':
        this.battleLog.addEntry(`${e.unitName} takes -${e.amount} HP (${e.effectDisplayName})`, 'negative');
        break;
      case 'effect_expired':
        this.battleLog.addEntry(`${e.effectDisplayName} expired on ${e.unitName}`, 'neutral');
        break;
    }
  }

  private handleSkipTurn(): void {
    const state = GameState.get();
    const result = skipActiveTurn({ state, context: this.turnContext });

    if (!result.skipped) return;

    this.turnContext = result.context;
    GameState.set(result.state);
    EventBus.emit(Events.STATE_CHANGED);
    this.presentTurnEvents(result.events);
    this.updateManualButtons(result.state);

    const winner = checkGameOver(result.state);
    if (winner) {
      const final: BattleState = { ...result.state, phase: 'end' };
      GameState.set(final);
      EventBus.emit(Events.STATE_CHANGED);
      this.time.delayedCall(Game.DELAY_GAMEOVER, () => this.showGameOver(winner));
      return;
    }

    this.time.delayedCall(Game.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(result.state),
    );
  }

  private handleChargeTurn(): void {
    const state = GameState.get();
    const result = chargeActiveTurn({ state, context: this.turnContext });

    if (!result.charged) return;

    this.turnContext = result.context;
    GameState.set(result.state);
    EventBus.emit(Events.STATE_CHANGED);
    this.presentTurnEvents(result.events);
    this.updateManualButtons(result.state);

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
      const used = hasChargedThisRound(this.turnContext, state.roundQueue[0]);
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
    const state = GameState.get();
    const phase = PhaseManager.getPhase();
    if (phase.type !== 'battle') return;

    if (state.phase === 'placement') {
      this.onPlacementStateChanged(phase);
    } else {
      this.refreshCells(state);
      this.refreshUnits(state);
      this.initiativeBar.update(state);
    }
  }

  private onPlacementStateChanged(
    phase: import('../core/phases').GamePhase & { type: 'battle' },
  ): void {
    const state = GameState.get();

    // Re-render player unit views if units map changed (placement/swap/move)
    if (this.prevPlacementUnits !== state.units) {
      // destroyUnitView calls this.unitViews.delete(id) internally — safe to use in this loop
      const toDestroy = [...this.unitViews.keys()].filter(id => {
        const unit = state.units.get(id);
        return !unit || unit.anchor.side === 'player';
      });
      for (const id of toDestroy) this.destroyUnitView(id);
      for (const unit of state.units.values()) {
        if (unit.anchor.side === 'player' && !this.unitViews.has(unit.id)) {
          this.createUnitView(unit);
        }
      }
      this.prevPlacementUnits = state.units;
    }

    this.buildBenchPanel();
    this.applyPlacementHighlights(phase.placementSelection);
  }

  private applyPlacementHighlights(selection: PlacementSelection): void {
    this.clearPlacementHighlights();
    if (!selection.selectedFieldUnitId) return;
    const unit = GameState.get().units.get(selection.selectedFieldUnitId);
    if (!unit) return;
    const cells = getOccupiedCells(unit.anchor, unit.shape);
    for (const coord of cells) {
      this.cellViews.get(cellKey(coord))?.setHighlight('selected');
    }
  }

  private refreshCells(state: BattleState): void {
    if (state.phase === "placement") return; // placement uses its own highlight logic

    const validKeys = new Set(state.validTargets.map(cellKey));
    const activeUnit = state.units.get(state.roundQueue[0]);
    const targetHighlight =
      (activeUnit && isEnchantmentSkill(getActiveSkill(activeUnit)))
        ? "heal_target"
        : "target";

    for (const [key, cell] of this.cellViews) {
      cell.setHighlight(validKeys.has(key) ? targetHighlight : "none");
      cell.clearEffectPreview();
    }

    if (activeUnit) {
      const cells = getOccupiedCells(activeUnit.anchor, activeUnit.shape);
      for (const coord of cells) {
        this.cellViews.get(cellKey(coord))?.setHighlight("selected");
      }
    }
  }

  private refreshUnits(state: BattleState): void {
    for (const [id, view] of this.unitViews) {
      if (!view.active) continue;
      view.update(state.units.get(id) ?? null);
    }
  }

  // ─── Skill Icon UI ─────────────────────────────────────────────────────────

  private showSkillIcons(unit: Unit): void {
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
    const state = GameState.get();
    const result = switchActiveSkillForManualTurn({ state, skillIndex: index });

    this.pendingTargetCoord = null;
    GameState.set(result.state);
    EventBus.emit(Events.STATE_CHANGED);

    const { activeUnit: unit, activeSkill: skill } = result;
    if (!unit || !skill) return;

    this.setStatus(
      isEnchantmentSkill(skill)
        ? `${unit.name} — Click on the green cell to heal`
        : `${unit.name} — Click on the red cell to attack`,
    );
    this.showSkillIcons(unit);
  }

  // ─── Visual Effects ────────────────────────────────────────────────────────

  private showFloatingDamage(x: number, y: number, amount: number): void {
    const text = this.add
      .text(x, y, `-${amount}`, {
        fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
        color: BATTLE_VISUAL_THEME.floatingText.damage,
        fontStyle: "bold",
        stroke: BATTLE_VISUAL_THEME.floatingText.stroke,
        strokeThickness: Math.round(3 * LAYOUT_SCALE),
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.tweens.add({
      targets: text,
      y: y - Math.round(55 * LAYOUT_SCALE),
      alpha: 0,
      duration: 900,
      ease: "Power2",
      onComplete: () => text.destroy(),
    });
  }

  private showFloatingHeal(x: number, y: number, amount: number): void {
    const text = this.add
      .text(x, y, `+${amount}`, {
        fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
        color: BATTLE_VISUAL_THEME.floatingText.heal,
        fontStyle: "bold",
        stroke: BATTLE_VISUAL_THEME.floatingText.stroke,
        strokeThickness: Math.round(3 * LAYOUT_SCALE),
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.tweens.add({
      targets: text,
      y: y - Math.round(55 * LAYOUT_SCALE),
      alpha: 0,
      duration: 900,
      ease: "Power2",
      onComplete: () => text.destroy(),
    });
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

    const onExit = outcome === 'victory'
      ? (): void => {
          const p = PhaseManager.getPhase();
          if (p.type !== 'battle') return;

          const aliveIds = new Set(
            [...GameState.get().units.values()]
              .filter(u => u.id.startsWith('p'))
              .map(u => u.templateId),
          );
          const participants: BattleParticipant[] = p.participants.map(pp => ({
            ...pp,
            isAlive: pp.wasOnBench || aliveIds.has(pp.templateId),
          }));
          PhaseManager.transition({ type: 'exit_battle', participants });
        }
      : (): void => {
          PhaseManager.transition({ type: 'exit_battle', participants: [] });
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
