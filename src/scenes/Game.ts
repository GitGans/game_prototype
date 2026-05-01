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
import type { BenchUnitSnapshot, BattleUnitSnapshot } from "../shared/battleSnapshots";
import { buildBattleUnitSnapshot } from "../core/battleSnapshotBuilder";
import { PhaseManager } from '../core/PhaseManager';
import { type PhaseAction, BattleParticipant } from '../core/phases';
import { type BattlePhaseActionResult } from '../core/phaseHandlers/battlePhaseHandler';
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
import { effectiveStats, computeDamageVsUnit } from "../battle/combat";
import { resolvePattern } from "../battle/skillPatterns";
import { getEffectPattern, getDamageModifierPercent } from "../data/skillDefinitions";
import { buildRoundQueue } from "../battle/initiative";
import type { BattleEvent } from '../battle/battleEvents';
import { hasChargedThisRound } from '../battle/turnResolver';

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
  private static readonly DELAY_AUTO_NEXT = 150;
  private static readonly DELAY_GAMEOVER = 600;

  // Placement phase UI
  private benchCards: BenchCard[] = [];
  private startBattleBtn: Button | null = null;
  private autoBattleButtons: Button[] = [];
  private manualTurnButtons: Button[] = [];
  private chargeBtn: Button | null = null;
  private pendingTargetCoord: CellCoord | null = null;
  private lastClickCoordKey: string | null = null;
  private skillBar!: SkillBar;
  private lastClickTime = 0;

  private prevPlacementUnitsSignature: string | null = null;

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
    this.prevPlacementUnitsSignature = null;
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

  private onPlacementCellClick(coord: CellCoord, phase: BattlePhase): void {
    if (coord.side !== 'player') return;
    const { selectedBenchIdx, selectedFieldUnitId } = phase.placementSelection;
    const unitId = phase.occupancy.cellToUnitId.get(cellKey(coord));

    if (selectedBenchIdx !== null) {
      if (!unitId) {
        PhaseManager.transition({ type: 'place_bench_unit', benchIdx: selectedBenchIdx, anchor: coord });
      } else {
        PhaseManager.transition({ type: 'swap_bench_with_field', benchIdx: selectedBenchIdx, fieldUnitId: unitId });
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

  // ─── Double Click Detection ────────────────────────────────────────────────

  private handlePointerDown(coord: CellCoord): void {
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

  // ─── Input ─────────────────────────────────────────────────────────────────

  private setupInput(): void {
    for (const [, cell] of this.cellViews) {
      cell.on('pointerdown', () => this.handlePointerDown(cell.coord));
      cell.on('pointerup', () => {
        const phase = PhaseManager.getPhase();
        if (phase.type !== 'battle') return;
        if (phase.battlePhase === 'placement') {
          this.onPlacementCellClick(cell.coord, phase);
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
      this.showSkillPreview(phase, coord);
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
    PhaseManager.refreshSnapshot(); // TODO(stage-5): fold startBattle into PhaseManager.transition so this emit goes away
    EventBus.emit(Events.STATE_CHANGED);
    this.setStatus("");
    this.battleLog.setVisible(true);
    GameState.resetBattleTurnContext();
    this.buildAutoBattleButtons();
    this.startActiveUnitTurn(state);
  }

  // ─── Turn Action Helpers ────────────────────────────────────────────────────

  private runBattleAction(action: BattleTurnSceneAction): BattlePhaseActionResult | null {
    PhaseManager.transition(action);
    return PhaseManager.getLastBattleTransition();
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
    this.presentBattleEvents(result.events, activeUnit);
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
        const { promptKind } = result.directive;
        const phase = PhaseManager.getPhase();
        const activeUnit = phase.type === 'battle' ? phase.activeUnit : null;
        this.setStatus(
          promptKind === 'heal'
            ? `${activeUnit?.name ?? '?'} — Click on the green cell to heal`
            : `${activeUnit?.name ?? '?'} — Click on the red cell to attack`,
        );
        if (activeUnit) this.showSkillIcons(activeUnit);
        return;
      }
    }
  }

  private showSkillPreview(phase: BattlePhase, coord: CellCoord): void {
    const activeUnit = phase.activeUnit;
    if (!activeUnit) return;

    this.refreshCells(phase);

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

    // ── Skill damage / heal lines ─────────────────────────────────────────────
    if (isHeal) {
      for (const { coord: hc } of hitCells) {
        const unitId = phase.occupancy.cellToUnitId.get(cellKey(hc));
        const unit = unitId ? phase.unitsById.get(unitId) : undefined;
        if (!unit || seen.has(unit.id)) continue;
        seen.add(unit.id);
        previewParts.push(`${unit.name} +${effectiveStats(activeUnit).magicalDamage}`);
      }
    } else {
      const damageType = skill.damageBlock?.damageType ?? 'physical';
      const attackerStats = effectiveStats(activeUnit);
      const baseDamage = damageType === 'physical' ? attackerStats.physicalDamage : attackerStats.magicalDamage;

      const ignorePercent: Partial<Record<string, number>> = {};
      if (skill.damageModifierBlocks) {
        for (const block of skill.damageModifierBlocks) {
          ignorePercent[block.type] = getDamageModifierPercent(block);
        }
      }
      const defIgnoreKey = damageType === 'physical' ? 'ignore_physical_defense' : 'ignore_magical_defense';
      const defIgnore = ignorePercent[defIgnoreKey] ?? 0;

      for (const { coord: hc, multiplier } of hitCells) {
        const unitId = phase.occupancy.cellToUnitId.get(cellKey(hc));
        const unit = unitId ? phase.unitsById.get(unitId) : undefined;
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

      previewParts.push(`[${eb.effectDisplayName}]`);

      if (computedPerTurn !== undefined) {
        const seenEffect = new Set<string>();
        const sign = resolvedEffect.isBuff ? '+' : '-';
        for (const { coord: ec } of effectCellCoords) {
          const unitId = phase.occupancy.cellToUnitId.get(cellKey(ec));
          const unit = unitId ? phase.unitsById.get(unitId) : undefined;
          if (!unit || seenEffect.has(unit.id)) continue;
          seenEffect.add(unit.id);
          previewParts.push(`${unit.name} ${sign}${computedPerTurn} HP/round`);
        }
      }
    }

    // ── Assemble status text ──────────────────────────────────────────────────
    const preview = `Preview:\n${previewParts.join('\n')}\n[click again to confirm]`;
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

  private handleTargetSelect(coord: CellCoord, phase: BattlePhase): void {
    const attackerId = phase.activeUnitId!;
    const activeUnit = phase.activeUnit;

    // Sprite animation — stays in scene (Phaser, not logic)
    const attackerView = this.unitViews.get(attackerId);
    attackerView?.setSpriteState('attack');
    this.time.delayedCall(400, () => {
      const current = GameState.get().units.get(attackerId);
      if (current && current.hp > 0) attackerView?.setSpriteState('idle');
    });

    // battle_use_skill composes: executeSkillUse → checkGameOver → advanceTurn → checkGameOver
    const result = this.runBattleAction({
      type: 'battle_use_skill',
      unitId: attackerId,
      target: coord,
    });
    if (!result) return;

    this.presentBattleEvents(result.events, activeUnit);

    if (this.handleBattleWinner(result)) return;

    this.time.delayedCall(Game.DELAY_NEXT_TURN, () =>
      this.startActiveUnitTurn(result.state),
    );
  }

  private presentBattleEvents(events: BattleEvent[], activeUnit: BattleUnitSnapshot | Unit | null | undefined): void {
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

        case 'effect_tick_heal':
          this.battleLog.addEntry(
            `${e.unitName} regenerates +${e.amount} HP (${e.effectDisplayName})`,
            'positive',
          );
          break;

        case 'effect_tick_damage':
          this.battleLog.addEntry(
            `${e.unitName} takes -${e.amount} HP (${e.effectDisplayName})`,
            'negative',
          );
          break;

        case 'effect_expired':
          this.battleLog.addEntry(`${e.effectDisplayName} expired on ${e.unitName}`, 'neutral');
          break;
      }
    }
  }

  private autoTurn(): void {
    const state = GameState.get();
    if (state.phase === 'end') return;

    const unitId = state.roundQueue[0];
    let activeUnit = state.units.get(unitId);
    const isEnemy = activeUnit?.anchor.side === 'enemy';

    // Guard: player units in non-auto mode hand control back to startActiveUnitTurn.
    // Enemy units always act automatically regardless of battle mode.
    if (!isEnemy && GameState.getBattleMode() !== 'auto') {
      if (GameState.getBattleMode() === 'manual') {
        this.startActiveUnitTurn(state);
      }
      return;
    }

    // Branch A: missing active unit — delegate fully to startActiveUnitTurn.
    // battle_start_turn advances the queue and returns continue_immediately,
    // which startActiveUnitTurn handles with a game-over check before recursing.
    if (!activeUnit) {
      this.startActiveUnitTurn(state);
      return;
    }

    // Pick a random skill. Dispatch select_skill so the skill choice is persisted
    // in GameState before resolving targets or executing.
    const randomSkillIdx = resolveRandomSkillIndex(activeUnit);
    const selected = this.runBattleAction({
      type: 'battle_select_skill',
      skillIndex: randomSkillIdx,
    });
    if (!selected) return;

    // Re-read active unit and skill from the updated state.
    activeUnit = selected.state.units.get(unitId) ?? activeUnit;
    if (!activeUnit) return;
    const currentSkill = getActiveSkill(activeUnit);
    const targets = resolveSkillTargets(activeUnit, currentSkill, selected.state.occupancy);

    // Branch B: no valid targets.
    // Melee units emit turn_skipped with 'blocked_melee'.
    // Non-melee units (ranged/enchantment with no reachable target) silently advance —
    // emitting blocked_melee for them would be semantically wrong.
    if (targets.length === 0) {
      if (currentSkill.actionType === 'melee') {
        const result = this.runBattleAction({
          type: 'battle_skip_turn',
          reason: 'blocked_melee',
        });
        if (!result) return;
        this.presentBattleEvents(result.events, activeUnit);
        if (this.handleBattleWinner(result, { destroyAutoButtons: true })) return;
        this.time.delayedCall(Game.DELAY_AUTO_NEXT, () =>
          this.startActiveUnitTurn(result.state),
        );
      } else {
        const result = this.runBattleAction({ type: 'battle_advance_turn' });
        if (!result) return;
        this.presentBattleEvents(result.events, activeUnit);
        if (this.handleBattleWinner(result, { destroyAutoButtons: true })) return;
        this.time.delayedCall(Game.DELAY_AUTO_NEXT, () =>
          this.startActiveUnitTurn(result.state),
        );
      }
      return;
    }

    const target = isEnchantmentSkill(currentSkill)
      ? resolveBestHealTarget(selected.state.occupancy, targets)
      : resolveRandomTarget(targets);

    // Branch C: target helpers returned null (edge case in enchantment/heal logic).
    // Silent advance — preserves current behavior of skipping without a log entry.
    if (!target) {
      const result = this.runBattleAction({ type: 'battle_advance_turn' });
      if (!result) return;
      this.presentBattleEvents(result.events, activeUnit);
      if (this.handleBattleWinner(result, { destroyAutoButtons: true })) return;
      this.time.delayedCall(Game.DELAY_AUTO_NEXT, () =>
        this.startActiveUnitTurn(result.state),
      );
      return;
    }

    // Branch D: valid target — execute skill.
    // battle_use_skill composes: executeSkillUse → checkGameOver → advanceTurn → checkGameOver.
    // Do NOT dispatch battle_advance_turn after this.
    const unitView = this.unitViews.get(unitId);
    unitView?.setSpriteState('attack');
    this.time.delayedCall(400, () => {
      const current = GameState.get().units.get(unitId);
      if (current && current.hp > 0) unitView?.setSpriteState('idle');
    });

    const result = this.runBattleAction({
      type: 'battle_use_skill',
      unitId,
      target,
      skillIndex: randomSkillIdx,
    });
    if (!result) return;

    this.presentBattleEvents(result.events, activeUnit);
    if (this.handleBattleWinner(result, { destroyAutoButtons: true })) return;
    this.time.delayedCall(Game.DELAY_AUTO_NEXT, () =>
      this.startActiveUnitTurn(result.state),
    );
  }

  private runQuickBattle(): void {
    // Reset turn context so charge-tracking from a prior manual turn does not leak in.
    GameState.resetBattleTurnContext();

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

    // Terminal presentation write: mark the battle as ended and trigger a single re-render.
    // This is the one direct GameState.set allowed in Stage 3 — it is not a turn mutation
    // but a final phase transition for display purposes.
    const finalState: BattleState = { ...GameState.get(), phase: 'end' };
    GameState.set(finalState);
    PhaseManager.refreshSnapshot(); // TODO(stage-5): fold quick battle terminal state into PhaseManager.transition so this emit goes away
    EventBus.emit(Events.STATE_CHANGED);

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
            // battle_start_turn resets validTargets and recomputes directive.
            // Must consume events and winner: start_turn may advance internally.
            const result = this.runBattleAction({ type: 'battle_start_turn' });
            if (!result) return;
            this.presentBattleEvents(result.events, active);
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

  private handleSkipTurn(): void {
    // Pre-action active unit: used only as style hint for presentBattleEvents.
    const state = GameState.get();
    const activeUnit = state.units.get(state.roundQueue[0]);

    const result = this.runBattleAction({ type: 'battle_skip_turn', reason: 'manual_skip' });
    if (!result) return;

    this.presentBattleEvents(result.events, activeUnit);
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

    this.presentBattleEvents(result.events, activeUnit);
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
      this.onPlacementStateChanged(phase);
    } else if (phase.battlePhase !== 'end') {
      this.refreshCells(phase);
      this.refreshUnits(phase);
      this.initiativeBar.update({ roundQueue: phase.roundQueue, unitsById: phase.unitsById });
    }
  }

  private onPlacementStateChanged(phase: BattlePhase): void {
    const sig = this.buildPlacementUnitsSignature(phase);

    if (sig !== this.prevPlacementUnitsSignature) {
      this.reconcilePlacementUnitViews(phase);
      this.prevPlacementUnitsSignature = sig;
    }

    this.buildBenchPanel();
    this.applyPlacementHighlights(phase);
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

    for (const [id] of [...this.unitViews]) {
      const unit = phase.unitsById.get(id);
      if (!unit) {
        this.destroyUnitView(id);
        continue;
      }
      if (unit.anchor.side === 'player' && !playerUnitIds.has(id)) {
        this.destroyUnitView(id);
      }
    }

    for (const unit of phase.units) {
      if (unit.anchor.side === 'player' && !this.unitViews.has(unit.id)) {
        this.createUnitView(unit);
      }
    }

    for (const unit of phase.units) {
      if (unit.anchor.side === 'player') {
        this.unitViews.get(unit.id)?.update(unit);
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
      this.cellViews.get(cellKey(coord))?.setHighlight('selected');
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
      isEnchantmentSkill(skill)
        ? `${activeUnit.name} — Click on the green cell to heal`
        : `${activeUnit.name} — Click on the red cell to attack`,
    );
    this.showSkillIcons(activeUnit);
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
