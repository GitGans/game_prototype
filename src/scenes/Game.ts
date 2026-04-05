import Phaser from "phaser";
import {
  CELL_SIZE,
  CELL_GAP,
  GRID_COLS,
  GRID_ROWS,
  SIDE_GAP,
  BENCH_PANEL_WIDTH,
  BENCH_GAP,
  COLORS,
  DAMAGE,
  HEAL_AMOUNT,
  LAYOUT_SCALE,
} from "../core/Constants";
import { EventBus, Events } from "../core/EventBus";
import { GameState } from "../core/GameState";
import { CellView } from "../objects/CellView";
import { UnitView } from "../objects/UnitView";
import { InitiativeBar } from "../objects/InitiativeBar";
import { BattleLog } from "../objects/BattleLog";
import {
  BattleState,
  CellCoord,
  Side,
  Unit,
  UnitBlueprint,
} from "../battle/types";
import { renderPixelArt } from "../core/PixelRenderer";
import { UNIT_TEXTURES, GAME_PALETTE } from "../sprites/units";
import { cellKey } from "../battle/field";
import { getOccupiedCells } from "../battle/shapes";
import { canPlace, placeUnit } from "../battle/placement";
import { buildOccupancy } from "../battle/occupancy";
import { getMeleeTargets, getRangedTargets, getFriendlyTargets } from "../battle/targeting";
import { resolveAttack, resolveHeal, checkGameOver } from "../battle/combat";
import { buildRoundQueue, pruneQueue } from "../battle/initiative";
import {
  autoPlacePlayer,
  autoPlaceEnemies,
  createUnitInstance,
  blueprintFromUnit,
} from "../battle/autoPlace";

export class Game extends Phaser.Scene {
  private cellViews: Map<string, CellView> = new Map();
  private unitViews: Map<string, UnitView> = new Map();
  private initiativeBar!: InitiativeBar;
  private statusText!: Phaser.GameObjects.Text;
  private battleLog!: BattleLog;

  // Placement phase UI
  private benchCards: Phaser.GameObjects.Container[] = [];
  private startBattleBtn: Phaser.GameObjects.Container | null = null;
  private selectedBenchIdx: number | null = null;
  private selectedFieldUnitId: string | null = null;
  private lastClickCoordKey: string | null = null;
  private lastClickTime = 0;

  // Counter for generating unique unit IDs during placement
  private playerIdCounter = 0;

  constructor() {
    super("Game");
  }

  create(): void {
    GameState.reset();

    // Register pixel art textures (kept for forward compatibility)
    for (const [key, { pixels, scale }] of Object.entries(UNIT_TEXTURES)) {
      renderPixelArt(this, pixels, GAME_PALETTE, key, scale);
    }

    this.buildGrid();
    this.initBattle();
    this.buildUnitViews();
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
    const gridY = (canvasH - totalGridH) / 2 + Math.round(40 * LAYOUT_SCALE);

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

    const topY =
      this.cellPixelPos("player", 0, 2).y -
      CELL_SIZE / 2 -
      Math.round(14 * LAYOUT_SCALE);
    const { x: pFrontX } = this.cellPixelPos("player", 0, 0);
    const { x: pBackX } = this.cellPixelPos("player", 1, 0);
    const { x: eFrontX } = this.cellPixelPos("enemy", 0, 0);
    const { x: eBackX } = this.cellPixelPos("enemy", 1, 0);
    const playerCenterX = (pFrontX + pBackX) / 2;
    const enemyCenterX = (eFrontX + eBackX) / 2;
    const sideY = topY - Math.round(18 * LAYOUT_SCALE);
    this.add
      .text(playerCenterX, sideY, "PLAYER", {
        fontSize: `${Math.round(14 * LAYOUT_SCALE)}px`,
        color: COLORS.label,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 1);
    this.add
      .text(enemyCenterX, sideY, "ENEMY", {
        fontSize: `${Math.round(14 * LAYOUT_SCALE)}px`,
        color: COLORS.labelEnemy,
        fontStyle: "bold",
      })
      .setOrigin(0.5, 1);
  }

  // ─── Battle Initialisation ─────────────────────────────────────────────────

  private initBattle(): void {
    let state = GameState.get();
    state = autoPlacePlayer(state);
    state = autoPlaceEnemies(state);

    // Determine the highest player instance counter used so we can continue from there
    this.playerIdCounter = state.units.size; // rough upper bound; refined below
    let maxP = 0;
    for (const id of state.units.keys()) {
      if (id.startsWith("p")) {
        const n = parseInt(id.slice(1), 10);
        if (!isNaN(n) && n > maxP) maxP = n;
      }
    }
    this.playerIdCounter = maxP;

    GameState.set(state);
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

    // All units render as rectangles (no textureKey passed)
    const view = new UnitView(this, cx, cy, unit, colSpan, rowSpan, undefined);
    this.unitViews.set(unit.id, view);
  }

  private destroyUnitView(unitId: string): void {
    const view = this.unitViews.get(unitId);
    if (view) {
      view.destroy();
      this.unitViews.delete(unitId);
    }
  }

  // ─── UI ───────────────────────────────────────────────────────────────────

  private buildUI(): void {
    this.initiativeBar = new InitiativeBar(
      this,
      0,
      Math.round(8 * LAYOUT_SCALE),
    );

    this.statusText = this.add
      .text(
        this.scale.width / 2,
        this.scale.height - Math.round(20 * LAYOUT_SCALE),
        "",
        {
          fontSize: `${Math.round(14 * LAYOUT_SCALE)}px`,
          color: COLORS.textLight,
          align: "center",
        },
      )
      .setOrigin(0.5);

    const totalGridW = GRID_ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const rightGridRightEdge =
      this.scale.width / 2 + SIDE_GAP / 2 + totalGridW;
    const logGap = Math.round(10 * LAYOUT_SCALE);
    const logX = rightGridRightEdge + logGap;
    const logY = this.cellPixelPos("enemy", 0, 2).y - CELL_SIZE / 2;
    const logW = this.scale.width - logX - logGap;
    const logH =
      this.cellPixelPos("enemy", 0, 0).y +
      CELL_SIZE / 2 -
      logY;
    this.battleLog = new BattleLog(this, logX, logY, logW, logH);
    this.battleLog.setVisible(false);
  }

  private setStatus(msg: string): void {
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
    return Math.round(CELL_SIZE * 0.72);
  }

  private benchPanelX(): number {
    const totalGridW = GRID_ROWS * (CELL_SIZE + CELL_GAP) - CELL_GAP;
    const leftGridX = this.scale.width / 2 - SIDE_GAP / 2 - totalGridW;
    return leftGridX - BENCH_GAP - BENCH_PANEL_WIDTH / 2;
  }

  private buildBenchPanel(): void {
    // Destroy any existing cards
    for (const card of this.benchCards) card.destroy();
    this.benchCards = [];

    const state = GameState.get();
    const cardH = this.benchCardHeight();
    const panelX = this.benchPanelX();

    // Vertical centre aligned with the grid
    const gridTopY = this.cellPixelPos("player", 0, 2).y - CELL_SIZE / 2;
    const gridBottomY = this.cellPixelPos("player", 0, 0).y + CELL_SIZE / 2;
    const totalH =
      state.benchUnits.length * cardH +
      (state.benchUnits.length - 1) * Math.round(4 * LAYOUT_SCALE);
    const startY = (gridTopY + gridBottomY) / 2 - totalH / 2 + cardH / 2;

    state.benchUnits.forEach((bp, idx) => {
      const cardY = startY + idx * (cardH + Math.round(4 * LAYOUT_SCALE));
      const isSelected = this.selectedBenchIdx === idx;
      const card = this.makeBenchCard(bp, idx, panelX, cardY, isSelected);
      this.benchCards.push(card);
    });
  }

  private makeBenchCard(
    bp: UnitBlueprint,
    idx: number,
    x: number,
    y: number,
    selected: boolean,
  ): Phaser.GameObjects.Container {
    const cardH = this.benchCardHeight();
    const fillColor = selected ? COLORS.benchSelected : COLORS.bench;
    const rect = this.add
      .rectangle(0, 0, BENCH_PANEL_WIDTH, cardH, fillColor, 0.9)
      .setStrokeStyle(Math.round(1 * LAYOUT_SCALE), COLORS.benchBorder);

    const nameStyle = {
      fontSize: `${Math.round(11 * LAYOUT_SCALE)}px`,
      color: COLORS.label,
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: BENCH_PANEL_WIDTH - 8 },
    };
    const nameText = this.add
      .text(0, -Math.round(10 * LAYOUT_SCALE), bp.name, nameStyle)
      .setOrigin(0.5, 0.5);

    const statsStyle = {
      fontSize: `${Math.round(10 * LAYOUT_SCALE)}px`,
      color: COLORS.textDark,
      align: "center",
    };
    const statsText = this.add
      .text(
        0,
        Math.round(8 * LAYOUT_SCALE),
        `HP:${bp.hp} Инц:${bp.initiative}`,
        statsStyle,
      )
      .setOrigin(0.5, 0.5);

    const container = this.add.container(x, y, [rect, nameText, statsText]);
    container.setSize(BENCH_PANEL_WIDTH, cardH);
    container.setInteractive({ useHandCursor: true });
    container.on("pointerup", () => this.onBenchCardClick(idx));
    container.on("pointerover", () => {
      if (this.selectedBenchIdx !== idx) rect.setFillStyle(0x2a3a4a, 0.9);
    });
    container.on("pointerout", () => {
      if (this.selectedBenchIdx !== idx) rect.setFillStyle(fillColor, 0.9);
    });
    return container;
  }

  private onBenchCardClick(idx: number): void {
    if (this.selectedFieldUnitId !== null) {
      const state = GameState.get();
      const fieldUnit = [...state.units.values()].find(
        (u) => u.id === this.selectedFieldUnitId,
      );
      const bp = state.benchUnits[idx];
      if (fieldUnit && bp) {
        this.swapBenchWithField(bp, idx, fieldUnit);
      }
      this.selectedFieldUnitId = null;
      this.clearPlacementHighlights();
      this.buildBenchPanel();
      return;
    }
    if (this.selectedBenchIdx === idx) {
      this.selectedBenchIdx = null;
    } else {
      this.selectedBenchIdx = idx;
      this.selectedFieldUnitId = null;
      this.clearPlacementHighlights();
    }
    this.buildBenchPanel();
  }

  private buildStartBattleButton(): void {
    if (this.startBattleBtn) {
      this.startBattleBtn.destroy();
      this.startBattleBtn = null;
    }

    const btnW = Math.round(120 * LAYOUT_SCALE);
    const btnH = Math.round(36 * LAYOUT_SCALE);
    // Place below the initiative bar
    const btnY =
      Math.round(8 * LAYOUT_SCALE) +
      Math.round(28 * LAYOUT_SCALE) +
      btnH / 2 +
      Math.round(6 * LAYOUT_SCALE);
    const btnX = this.scale.width / 2;

    const rect = this.add
      .rectangle(0, 0, btnW, btnH, 0x2a6a2a)
      .setStrokeStyle(Math.round(1 * LAYOUT_SCALE), 0x44aa44);
    const label = this.add
      .text(0, 0, "⚔  Battle", {
        fontSize: `${Math.round(14 * LAYOUT_SCALE)}px`,
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const btn = this.add.container(btnX, btnY, [rect, label]);
    btn.setSize(btnW, btnH);
    btn.setInteractive({ useHandCursor: true });
    btn.on("pointerover", () => rect.setFillStyle(0x3a8a3a));
    btn.on("pointerout", () => rect.setFillStyle(0x2a6a2a));
    btn.on("pointerup", () => this.startBattle());

    this.startBattleBtn = btn;
  }

  private clearPlacementHighlights(): void {
    for (const [, cell] of this.cellViews) {
      cell.setHighlight("none");
    }
  }

  private highlightFieldUnit(unitId: string | null): void {
    this.clearPlacementHighlights();
    if (!unitId) return;
    const state = GameState.get();
    const unit = state.units.get(unitId);
    if (!unit) return;
    const cells = getOccupiedCells(unit.anchor, unit.shape);
    for (const coord of cells) {
      this.cellViews.get(cellKey(coord))?.setHighlight("selected");
    }
  }

  // ─── Placement Input ───────────────────────────────────────────────────────

  private onPlacementCellClick(coord: CellCoord): void {
    if (coord.side !== "player") return;

    const state = GameState.get();
    const unitAtCell = state.occupancy.cellToUnit.get(cellKey(coord));

    if (this.selectedBenchIdx !== null) {
      const bp = state.benchUnits[this.selectedBenchIdx];
      if (!bp) return;

      if (!unitAtCell) {
        // Place on empty cell
        this.placeBenchUnitOnField(bp, this.selectedBenchIdx, coord);
      } else {
        // Swap: field unit goes to bench, bench unit takes its place
        this.swapBenchWithField(bp, this.selectedBenchIdx, unitAtCell);
      }
      this.selectedBenchIdx = null;
      this.buildBenchPanel();
      return;
    }

    // No bench unit selected
    if (unitAtCell) {
      if (this.selectedFieldUnitId === null) {
        // Select this field unit
        this.selectedFieldUnitId = unitAtCell.id;
        this.highlightFieldUnit(unitAtCell.id);
      } else if (this.selectedFieldUnitId === unitAtCell.id) {
        // Deselect
        this.selectedFieldUnitId = null;
        this.clearPlacementHighlights();
      } else {
        // Swap two field units
        this.swapFieldUnits(this.selectedFieldUnitId, unitAtCell.id);
        this.selectedFieldUnitId = null;
        this.clearPlacementHighlights();
      }
    } else {
      // Empty cell with a field unit selected → move it
      if (this.selectedFieldUnitId !== null) {
        this.moveFieldUnit(this.selectedFieldUnitId, coord);
        this.selectedFieldUnitId = null;
        this.clearPlacementHighlights();
      }
    }
  }

  private placeBenchUnitOnField(
    bp: UnitBlueprint,
    benchIdx: number,
    anchor: CellCoord,
  ): void {
    let state = GameState.get();
    const newId = `p${++this.playerIdCounter}`;
    const unit = createUnitInstance(bp, newId, anchor);

    if (!canPlace(anchor, bp.shape, state, "player")) return;

    state = placeUnit(unit, state);
    const newBench = state.benchUnits.filter((_, i) => i !== benchIdx);
    state = { ...state, benchUnits: newBench };
    GameState.set(state);

    this.createUnitView(unit);
  }

  private swapBenchWithField(
    bp: UnitBlueprint,
    benchIdx: number,
    fieldUnit: Unit,
  ): void {
    let state = GameState.get();
    const anchor = fieldUnit.anchor;

    // Remove field unit
    const newUnits = new Map(state.units);
    newUnits.delete(fieldUnit.id);
    state = { ...state, units: newUnits, occupancy: buildOccupancy(newUnits) };

    // Check new unit fits
    if (!canPlace(anchor, bp.shape, state, "player")) {
      // Restore and abort
      state = GameState.get();
      return;
    }

    const newId = `p${++this.playerIdCounter}`;
    const newUnit = createUnitInstance(bp, newId, anchor);
    state = placeUnit(newUnit, state);

    // Update bench: replace bp at benchIdx with field unit's blueprint
    const newBench = [...state.benchUnits];
    newBench[benchIdx] = blueprintFromUnit(fieldUnit);
    state = { ...state, benchUnits: newBench };
    GameState.set(state);

    this.destroyUnitView(fieldUnit.id);
    this.createUnitView(newUnit);
  }

  private swapFieldUnits(idA: string, idB: string): void {
    let state = GameState.get();
    const unitA = state.units.get(idA);
    const unitB = state.units.get(idB);
    if (!unitA || !unitB) return;

    const anchorA = unitA.anchor;
    const anchorB = unitB.anchor;

    // Remove both
    const tmpUnits = new Map(state.units);
    tmpUnits.delete(idA);
    tmpUnits.delete(idB);
    const tmpState = {
      ...state,
      units: tmpUnits,
      occupancy: buildOccupancy(tmpUnits),
    };

    if (!canPlace(anchorB, unitA.shape, tmpState, "player")) return;
    if (!canPlace(anchorA, unitB.shape, tmpState, "player")) return;

    state = placeUnit({ ...unitA, anchor: anchorB }, tmpState);
    state = placeUnit({ ...unitB, anchor: anchorA }, state);
    GameState.set(state);

    this.destroyUnitView(idA);
    this.destroyUnitView(idB);
    this.createUnitView({ ...unitA, anchor: anchorB });
    this.createUnitView({ ...unitB, anchor: anchorA });
  }

  private moveFieldUnit(unitId: string, newAnchor: CellCoord): void {
    let state = GameState.get();
    const unit = state.units.get(unitId);
    if (!unit) return;

    const tmpUnits = new Map(state.units);
    tmpUnits.delete(unitId);
    const tmpState = {
      ...state,
      units: tmpUnits,
      occupancy: buildOccupancy(tmpUnits),
    };

    if (!canPlace(newAnchor, unit.shape, tmpState, "player")) return;

    state = placeUnit({ ...unit, anchor: newAnchor }, tmpState);
    GameState.set(state);

    this.destroyUnitView(unitId);
    this.createUnitView({ ...unit, anchor: newAnchor });
  }

  private removeFieldUnit(coord: CellCoord): void {
    const state = GameState.get();
    const unit = state.occupancy.cellToUnit.get(cellKey(coord));
    if (!unit) return;

    const newUnits = new Map(state.units);
    newUnits.delete(unit.id);
    const newBench = [...state.benchUnits, blueprintFromUnit(unit)];
    const newState = {
      ...state,
      units: newUnits,
      occupancy: buildOccupancy(newUnits),
      benchUnits: newBench,
    };
    GameState.set(newState);

    this.destroyUnitView(unit.id);
    this.buildBenchPanel();
  }

  // ─── Double Click Detection ────────────────────────────────────────────────

  private handlePointerDown(coord: CellCoord): void {
    if (GameState.get().phase !== "placement") return;
    if (coord.side !== "player") return;

    const key = cellKey(coord);
    const now = Date.now();

    if (key === this.lastClickCoordKey && now - this.lastClickTime < 300) {
      // Double click — remove unit from field
      this.removeFieldUnit(coord);
      this.selectedFieldUnitId = null;
      this.selectedBenchIdx = null;
      this.clearPlacementHighlights();
      this.buildBenchPanel();
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
    }
  }

  private onCellClick(coord: CellCoord): void {
    const state = GameState.get();
    if (state.phase !== "select_target") return;
    this.handleTargetSelect(coord, state);
  }

  // ─── Start Battle ──────────────────────────────────────────────────────────

  private startBattle(): void {
    // Tear down placement UI
    for (const card of this.benchCards) card.destroy();
    this.benchCards = [];
    if (this.startBattleBtn) {
      this.startBattleBtn.destroy();
      this.startBattleBtn = null;
    }
    this.selectedBenchIdx = null;
    this.selectedFieldUnitId = null;
    this.clearPlacementHighlights();

    let state = GameState.get();
    const queue = buildRoundQueue(state.units);
    state = { ...state, roundQueue: queue, phase: "select_target" };
    GameState.set(state);
    EventBus.emit(Events.STATE_CHANGED, state);
    this.setStatus("");
    this.battleLog.setVisible(true);
    this.startActiveUnitTurn(state);
  }

  // ─── Turn Flow ─────────────────────────────────────────────────────────────

  private startActiveUnitTurn(state: BattleState): void {
    const activeId = state.roundQueue[0];
    if (!activeId) return;

    const activeUnit = state.units.get(activeId);
    if (!activeUnit) {
      const next = this.advanceQueue(state);
      GameState.set(next);
      this.startActiveUnitTurn(next);
      return;
    }

    if (activeUnit.anchor.side === "player") {
      let validTargets: CellCoord[];
      if (activeUnit.actionType === "heal") {
        validTargets = getFriendlyTargets("player", state.occupancy);
      } else if (activeUnit.actionType === "ranged") {
        validTargets = getRangedTargets("player", state.occupancy);
      } else {
        validTargets = getMeleeTargets(activeUnit, state.occupancy);
      }

      // Back-row melee blocked by own front row — auto-skip
      if (validTargets.length === 0 && activeUnit.actionType === "melee") {
        this.battleLog.addEntry(`${activeUnit.name} — blocked, skipping turn`, "neutral");
        const next = this.advanceQueue(state);
        GameState.set(next);
        EventBus.emit(Events.STATE_CHANGED, next);
        this.time.delayedCall(500, () => this.startActiveUnitTurn(next));
        return;
      }

      const next: BattleState = {
        ...state,
        phase: "select_target",
        validTargets,
      };
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.setStatus(
        activeUnit.actionType === "heal"
          ? `${activeUnit.name} — Click on the green cell to heal`
          : `${activeUnit.name} — Click on the red cell to attack`,
      );
    } else {
      const next: BattleState = {
        ...state,
        phase: "select_target",
        validTargets: [],
      };
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.setStatus(`${activeUnit.name} turn…`);
      this.time.delayedCall(700, () => this.enemyTurn());
    }
  }

  private handleTargetSelect(coord: CellCoord, state: BattleState): void {
    const isValid = state.validTargets.some(
      (c) =>
        c.side === coord.side && c.row === coord.row && c.col === coord.col,
    );
    if (!isValid) return;

    const activeUnit = state.units.get(state.roundQueue[0]);
    const targetUnit = state.occupancy.cellToUnit.get(cellKey(coord));

    if (activeUnit?.actionType === "heal") {
      if (targetUnit) {
        const view = this.unitViews.get(targetUnit.id);
        if (view) this.showFloatingHeal(view.x, view.y, HEAL_AMOUNT);
        this.battleLog.addEntry(
          `${activeUnit?.name ?? "?"} heals ${targetUnit.name} +${HEAL_AMOUNT}`,
          "positive",
        );
      }
      let next = resolveHeal([coord], HEAL_AMOUNT, state);
      next = this.advanceQueue(next);
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.time.delayedCall(500, () => this.startActiveUnitTurn(next));
      return;
    }

    if (targetUnit) {
      const view = this.unitViews.get(targetUnit.id);
      if (view) this.showFloatingDamage(view.x, view.y, DAMAGE);
      this.battleLog.addEntry(
        `${activeUnit?.name ?? "?"} attacks ${targetUnit.name} -${DAMAGE}`,
        "positive",
      );
    }

    let next = resolveAttack([coord], DAMAGE, state);

    const winner = checkGameOver(next);
    if (winner) {
      next = { ...next, phase: "end" };
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.time.delayedCall(600, () => this.showGameOver(winner));
      return;
    }

    next = this.advanceQueue(next);
    GameState.set(next);
    EventBus.emit(Events.STATE_CHANGED, next);
    this.time.delayedCall(500, () => this.startActiveUnitTurn(next));
  }

  private enemyTurn(): void {
    const state = GameState.get();
    if (state.phase === "end") return;

    const activeUnit = state.units.get(state.roundQueue[0]);

    if (activeUnit?.actionType === "heal") {
      const healTargets = getFriendlyTargets("enemy", state.occupancy);
      if (healTargets.length === 0) {
        const next = this.advanceQueue(state);
        GameState.set(next);
        this.startActiveUnitTurn(next);
        return;
      }
      const target = healTargets.reduce((best, coord) => {
        const u = state.occupancy.cellToUnit.get(cellKey(coord));
        const bestU = state.occupancy.cellToUnit.get(cellKey(best));
        return u && bestU && u.hp / u.maxHp < bestU.hp / bestU.maxHp
          ? coord
          : best;
      });
      const healedUnit = state.occupancy.cellToUnit.get(cellKey(target));
      if (healedUnit) {
        const view = this.unitViews.get(healedUnit.id);
        if (view) this.showFloatingHeal(view.x, view.y, HEAL_AMOUNT);
        this.battleLog.addEntry(
          `${activeUnit?.name ?? "?"} heals ${healedUnit.name} +${HEAL_AMOUNT}`,
          "negative",
        );
      }
      let next = resolveHeal([target], HEAL_AMOUNT, state);
      next = this.advanceQueue(next);
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.time.delayedCall(500, () => this.startActiveUnitTurn(next));
      return;
    }

    const targets = activeUnit?.actionType === "ranged"
      ? getRangedTargets("enemy", state.occupancy)
      : getMeleeTargets(activeUnit!, state.occupancy);

    if (targets.length === 0) {
      if (activeUnit?.actionType === "melee") {
        this.battleLog.addEntry(`${activeUnit.name} — blocked, skipping turn`, "neutral");
      }
      const next = this.advanceQueue(state);
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.startActiveUnitTurn(next);
      return;
    }

    const target = targets[Math.floor(Math.random() * targets.length)];
    const hitUnit = state.occupancy.cellToUnit.get(cellKey(target));
    if (hitUnit) {
      const view = this.unitViews.get(hitUnit.id);
      if (view) this.showFloatingDamage(view.x, view.y, DAMAGE);
      this.battleLog.addEntry(
        `${activeUnit?.name ?? "?"} attacks ${hitUnit.name} -${DAMAGE}`,
        "negative",
      );
    }

    let next = resolveAttack([target], DAMAGE, state);

    const winner = checkGameOver(next);
    if (winner) {
      next = { ...next, phase: "end" };
      GameState.set(next);
      EventBus.emit(Events.STATE_CHANGED, next);
      this.time.delayedCall(600, () => this.showGameOver(winner));
      return;
    }

    next = this.advanceQueue(next);
    GameState.set(next);
    EventBus.emit(Events.STATE_CHANGED, next);
    this.time.delayedCall(500, () => this.startActiveUnitTurn(next));
  }

  private advanceQueue(state: BattleState): BattleState {
    let remaining = state.roundQueue.slice(1);
    remaining = pruneQueue(remaining, state.units);
    const queue =
      remaining.length > 0 ? remaining : buildRoundQueue(state.units);
    return { ...state, roundQueue: queue, validTargets: [] };
  }

  // ─── State Refresh ─────────────────────────────────────────────────────────

  private onStateChanged(state: BattleState): void {
    this.refreshCells(state);
    this.refreshUnits(state);
    this.initiativeBar.update(state);
  }

  private refreshCells(state: BattleState): void {
    if (state.phase === "placement") return; // placement uses its own highlight logic

    const validKeys = new Set(state.validTargets.map(cellKey));
    const activeUnit = state.units.get(state.roundQueue[0]);
    const targetHighlight =
      activeUnit?.actionType === "heal" ? "heal_target" : "target";

    for (const [key, cell] of this.cellViews) {
      cell.setHighlight(validKeys.has(key) ? targetHighlight : "none");
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
      view.update(state.units.get(id) ?? null);
    }
  }

  // ─── Visual Effects ────────────────────────────────────────────────────────

  private showFloatingDamage(x: number, y: number, amount: number): void {
    const text = this.add
      .text(x, y, `-${amount}`, {
        fontSize: `${Math.round(22 * LAYOUT_SCALE)}px`,
        color: "#ff4444",
        fontStyle: "bold",
        stroke: "#000000",
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
        color: "#44dd44",
        fontStyle: "bold",
        stroke: "#000000",
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

  private showGameOver(winner: Side): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.72).setDepth(30);

    const isVictory = winner === "enemy";
    this.add
      .text(
        w / 2,
        h / 2 - Math.round(60 * LAYOUT_SCALE),
        isVictory ? "VICTORY!" : "DEFEAT",
        {
          fontSize: `${Math.round(52 * LAYOUT_SCALE)}px`,
          color: isVictory ? "#ffdd44" : "#ff4444",
          fontStyle: "bold",
          stroke: "#000000",
          strokeThickness: Math.round(5 * LAYOUT_SCALE),
        },
      )
      .setOrigin(0.5)
      .setDepth(31);

    const btnW = Math.round(180 * LAYOUT_SCALE);
    const btnH = Math.round(46 * LAYOUT_SCALE);
    const btnY = h / 2 + Math.round(40 * LAYOUT_SCALE);

    const btn = this.add
      .rectangle(w / 2, btnY, btnW, btnH, 0x2a4a7a)
      .setDepth(31)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(w / 2, btnY, "Play again", {
        fontSize: `${Math.round(18 * LAYOUT_SCALE)}px`,
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(32);

    btn.on("pointerover", () => btn.setFillStyle(0x3a6aaa));
    btn.on("pointerout", () => btn.setFillStyle(0x2a4a7a));
    btn.on("pointerup", () => this.scene.restart());
  }
}
